var _             = require('underscore');
var Client        = require('node-rest-client').Client;
var Twit          = require('twit');
var async         = require('async');
var wordfilter    = require('wordfilter');
var request       = require('request');
var emojiRegex 	  = require('emoji-regex');
var tumblr 		  = require('tumblr.js');
var rita 		  = require('rita');
var levenshtein   = require('fast-levenshtein');

var t = new Twit({
    consumer_key: 			process.env.SESTINA_TWIT_CONSUMER_KEY,
    consumer_secret: 		process.env.SESTINA_TWIT_CONSUMER_SECRET,
    app_only_auth: 			true
});

var tf = new Twit({
    consumer_key: 			process.env.SESTINA_TWIT_CONSUMER_KEY,
    consumer_secret: 		process.env.SESTINA_TWIT_CONSUMER_SECRET,
    access_token: 			process.env.SESTINA_TWIT_ACCESS_TOKEN,
    access_token_secret: 	process.env.SESTINA_TWIT_ACCESS_TOKEN_SECRET
});


var tumblrClient = tumblr.createClient({
  consumer_key: 			process.env.SESTINA_TUMBLR_CONSUMER_KEY,
  consumer_secret: 			process.env.SESTINA_TUMBLR_CONSUMER_SECRET,
  token: 					process.env.SESTINA_TUMBLR_ACCESS_TOKEN,
  token_secret: 			process.env.SESTINA_TUMBLR_ACCESS_TOKEN_SECRET
});

var wordnikKey = 			process.env.SESTINA_WORDNIK_KEY;

// RiTa.js
var lexicon = new rita.RiLexicon();

// Bad words
wordfilter.addWords(['nigga', 'niggas', 'nigg', 'pussies', 'gay']);

// Custom characters
wordfilter.addWords(['@','#', 'http', 'www']);

// Junk shorthand from lazy typers
wordfilter.addWords([' ur ', ' u ']);

// Lyrics and annoyingly frequent rhyme words to ignore
var annoyingRhymeRepeaters = ['grenade', 'dorr', 'hand-granade', 'noncore', 'arcade', 'doe', 'fomented', 'ion', 'mane', 'mayne', 'dase', 'belied', 'rase', 'dase', 'mane', 'mayne', 'guise', 'demur', 'deter', 'boo', 'ores', 'ore', 'gait', 'shoals', 'pries', 'moat', 'rye', 'blurt', 'flue', 'cleat', 'skeet'];

// Possible additions: ion
// So many terrible mistakes, due to auto-correct and laziness. I weep for our future.

// Tracking the rejects
var statsTracker = {
	total: 0,
	accepted: 0,
	hasMultiline: 0,	
	rejectTracker: {
		blacklist: 0,
		emoji: 0,
		hasNumber: 0,
		length: 0,
		notNearEnd: 0,
		excessivePunctuation: 0,
		noPunctuationAtEnd: 0,
		punctuationMisMatchAtEnd: 0,
		repetition: 0,
		selfReference: 0,
		slang: 0,
		upper: 0
	}
};

getRandomWords = function(cb) {
	console.log("========= Get Random Words =========");	
	var botData = {
		counter: 0,
		minTweets: 6,
		// levenshteinThreshold: 0,
		// wordCounter: 0,
		// maxWordCounter: 70,
		allWords: [],
		twitterResults: [],		
		// rhymingWordsData: [],
		// rhymingWordsArray: [],
		// rhymeSchemeArray: [],
		// finalRhymeSchemeArray: [],
		// aPhrases: [],
		// bPhrases: [],
		// aPhrasesQuotaMet: false,
		// bPhrasesQuotaMet: false,
		tumblrPostID: 0,
		tumblrPostTitle: ''
	};

    var client = new Client();

    var wordnikRandomOptions = {
    	hasDictionaryDef: "true",
		// includePartOfSpeech: "noun, adjective, verb, adverb",
		includePartOfSpeech: "noun, verb",
		minCorpusCount: "30000",
		maxCorpusCount: "-1",
		minDictionaryCount: "6",
		maxDictionaryCount: "-1",
		minLength: "3",
		maxLength: "6",
limit: "50",	// 50 
		api_key: wordnikKey
    };

    var wordnikGetRandomWordsURL = 
		"http://api.wordnik.com:80/v4/words.json/randomWords" 
		+ "?hasDictionaryDef=" + wordnikRandomOptions.hasDictionaryDef
		+ "&includePartOfSpeech=" + wordnikRandomOptions.includePartOfSpeech
		+ "&minCorpusCount=" + wordnikRandomOptions.minCorpusCount
		+ "&maxCorpusCount=" + wordnikRandomOptions.maxCorpusCount
		+ "&minDictionaryCount=" + wordnikRandomOptions.minDictionaryCount
		+ "&maxDictionaryCount=" + wordnikRandomOptions.maxDictionaryCount
		+ "&minLength=" + wordnikRandomOptions.minLength
		+ "&maxLength=" + wordnikRandomOptions.maxLength
		+ "&limit=" + wordnikRandomOptions.limit
		+ "&api_key=" + wordnikRandomOptions.api_key;

    var args = {
		headers: {'Accept':'application/json'}
    };

    client.get(wordnikGetRandomWordsURL, args, function (data, response) {
		if (response.statusCode === 200) {
			var result = JSON.parse(data);
			cb(null, botData, result);
		} else {
			cb(null, null);
		}
    });
};

cleanRandomWords = function(botData, result, cb) {
	console.log("========= Clean Random Words =========");	
	for (var i = result.length - 1; i >= 0; i--) {
		
		// If word begins with a capital letter, or contains an apostrophe: remove.
		if ((result[i].word.charAt(0) == result[i].word.charAt(0).toUpperCase()) 
			|| (/'/.test(result[i].word))) {
			result.splice(i, 1);
		} else {
			botData.allWords.push(result[i].word);
		};
	};

	cb(null, botData);
};


getAllPublicTweets = function(botData, cb) {
	console.log("========= Get All Public Tweets =========");
	botData.counter = 0;

	getAllTweetsSequence = function(pos) {
	    async.mapSeries(botData.allWords, getTweetsByWord, function(err, results){
	    	if (err) {
	    		cb("Problem getting Tweets. Sequence failed.");
	    	} else {
	    		console.log('--------- End Round ' + (botData.counter + 1) + '---------');
	    		if (results != null) {   			
					botData.twitterResults.push(results);
	    		}

	    		botData.counter++;

				if (botData.counter == botData.twitterResults.length) {
	    			cb(null, botData);
	    		} else {
	    			getAllTweetsSequence(botData.counter);
	    		}		
	    	}	
	    }); 
	}

	getAllTweetsSequence();
}


getTweetsByWord = function(word, cb) {
	var suffix = "%20-RT%20-%40%20-http";
	
	console.log('--------- ' + word + ' ---------');

    t.get('search/tweets', {q: word + suffix, count: 100, result_type: 'recent', lang: 'en', include_entities: 'false'}, function(err, data, response) {
		if (!err) {
			var twitterResults = [];

			// Loop through all returned statues
			for (var i = 0; i < data.statuses.length; i++) {
				statsTracker.total++;

				// Don't quote yourself. It's gauche.
				var username = data.statuses[i].user.screen_name;				
				if (/SestinaBot/.test(username)) {
					statsTracker.rejectTracker.selfReference++;
					continue;
				}

				data.statuses[i].text = data.statuses[i].text.trim();

				// Alteration: Adding period at the end of tweets.
				// I hate to mess with the original tweet. But we do this for Art!
				if (/[a-z]$/.test(data.statuses[i].text)) {
					data.statuses[i].text += ".";
				}

				var lowSelfEsteem = / i /g;
				data.statuses[i].text = data.statuses[i].text.replace(lowSelfEsteem, ' I ');

				var tweetOriginal = data.statuses[i].text;

				// Remove tweets with excessive uppercase
				if (/[A-Z]{2}/.test(tweetOriginal)) {
					statsTracker.rejectTracker.upper++;
					continue;  
				};

				var tweetLowerCase = tweetOriginal.toLowerCase();

				var currentTweetID = data.statuses[i].id_str,
					currentUserID = data.statuses[i].user.id_str,
					currentUserScreenName = data.statuses[i].user.screen_name;

				// Does the current tweet contain a number or weird characters?
				if (/[0-9#\/]+/.test(tweetLowerCase)) {		
					statsTracker.rejectTracker.hasNumber++;
					continue;
				}

				// Does the current tweet contain offensive words?
				if (wordfilter.blacklisted(tweetLowerCase)) {
					statsTracker.rejectTracker.blacklist++;
					continue;
				}

				// Does the tweet contain an emoji?
				if (emojiRegex().test(tweetLowerCase)) {
					statsTracker.rejectTracker.emoji++;
					continue;
				}

				// Do we have ellipses or ?! or other excessive punctuation? Reject.
				if (/[,?!.]{2}/.test(tweetLowerCase)) {
					statsTracker.rejectTracker.excessivePunctuation++;
					continue;
				}

				// Repeat offenders.
				// if (
				// 	(tweetLowerCase.indexOf('men cry and defy') > -1) || 
				//    	(tweetLowerCase.indexOf('episode of teen wolf') > -1) || 
				//    	(tweetLowerCase.indexOf('head in a comfortable bed') > -1)
				//    ) {
				// 		statsTracker.rejectTracker.repetition++;
				// 		continue;				 	
				// }

				// Keep within preferred character length
				var tweetLengthMin = 0,
					tweetLengthMax = 100,
					tweetMultiLengthMin = 85,
					tweetMultiLengthMax = 100,
					tweetRegularLengthMin = 0,
					tweetRegularLengthMax = 85;


				if ((tweetLowerCase.length <= tweetLengthMax) && (tweetLowerCase.length >= tweetLengthMin)) {
				} else {
					statsTracker.rejectTracker.length++;
					continue;
				}

				// Remove punctuation
				var ritaTweet = tweetLowerCase.replace(/[?.,-\/#!$%\^&\*;:{}=\-_`~()]/g,""),
					ritaTweetWordsArray = ritaTweet.split(" ");
				
				var slangFound = 0,
					maxSlangAllowed = 0,
					hasSlang = false;

				var wordPos = ritaTweetWordsArray.lastIndexOf(word), 
					maxDistanceUntilEnd = 4,
					isMultiline = false;

				var prefix = '',
					suffix = '';

				// Is our word within X characters of the end of the tweet?
				if ((ritaTweetWordsArray.length - wordPos) <= maxDistanceUntilEnd ) {

					// Is our word NOT the last word in the tweet?
					if ((ritaTweetWordsArray.length - wordPos) > 1) {
						isMultiline = true;

						var wordPosStart = tweetOriginal.toLowerCase().lastIndexOf(word),
							wordPosEnd = wordPosStart + word.length + 1;

						var prefix = tweetOriginal.slice(0, wordPosEnd),
							suffix = tweetOriginal.slice(wordPosEnd);

							suffix = suffix.trim();

						prefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);

						// Is last character in suffix appropriate punctuation? Is yes, add space.
						if (/[?!.]/.test(suffix.charAt(suffix.length-1))) {
							suffix += " ";
						} else {
							statsTracker.rejectTracker.punctuationMisMatchAtEnd++;
							continue;
						}
					} else {
						// Our word is the last word in the tweet
						isMultiline = false;					
					};
				} else {
					// console.log("- notNearEnd: ");
					statsTracker.rejectTracker.notNearEnd++;
					continue;
				}

				// Check lexicon for words, mark all else as slang
				for (var p = 0; p < ritaTweetWordsArray.length; p++) {
					if (lexicon.containsWord(ritaTweetWordsArray[p]) == undefined) {
						// console.log("Flagged: " + ritaTweetWordsArray[p]);
						slangFound++;
						
						if (slangFound > maxSlangAllowed) {
							// console.log('Has Slang: ' + tweetLowerCase);
							hasSlang = true;
							break;
						};
					};
				};

				if (hasSlang) {
					statsTracker.rejectTracker.slang++;
					continue;					
				};


				console.log(tweetLowerCase);

				var multiRegularLengthCheck = false;

				// If multi, range needs to be 50 - 80
				// If regular, range needs to be < 50 > 25.
				// Ensure that word exists within 25% of total tweet length;
				if ((isMultiline) 
					&& (tweetLowerCase.length >= tweetMultiLengthMin) 
					&& (tweetLowerCase.length <= tweetMultiLengthMax)) {
						multiRegularLengthCheck = true;
						statsTracker.hasMultiline++;
				} else if ((isMultiline == false)
					&& (tweetLowerCase.length >= tweetRegularLengthMin) 
					&& (tweetLowerCase.length <= tweetRegularLengthMax)) {
						multiRegularLengthCheck = true;
				};

				if (multiRegularLengthCheck == false) {
					statsTracker.rejectTracker.length++;
					continue;
				}

				var tweetData = {
					word: word,
					tweet: tweetOriginal,
					tweetID: currentTweetID,
					tweetLength: tweetLowerCase.length,
					multiline: isMultiline,
					tweetPrefix: prefix,
					tweetSuffix: suffix,
					userID: currentUserID,
					userScreenName: currentUserScreenName,
					url: "http://twitter.com/" + currentUserScreenName + "/status/" + currentTweetID
				};

				statsTracker.accepted++;
				twitterResults.push(tweetData);

// if (isMultiline) {
// 	console.log('M ' + tweetData.tweet + " (" + tweetLowerCase.length + ")");
// 	console.log('   Prefix: ' + prefix);
// 	console.log('   Suffix: ' + suffix);
// } else {
// 	console.log("+ " + tweetData.tweet + " (" + tweetLowerCase.length + ")");
// }
			}

			twitterResults = _.uniq(twitterResults, false, function(p) { return p.tweet})
			cb(null, twitterResults);

		} else {
			// Error, most likely rate limit reached. Continue anyways.
			console.log(err);
			cb("There was an error getting a public Tweet.");
			// cb(null, twitterResults);
		}
    });
};


nextFunction = function(botData, cb) {
	console.log("========= Next Function =========");

	for (var i = botData.twitterResults.length - 1; i >= 0; i--) {
		for (var j = botData.twitterResults[i].length; j >=0; j--) {
			if (botData.twitterResults[i][j] == undefined) {
				botData.twitterResults[i].splice(j, 1);
				continue;
			};

			if (botData.twitterResults[i][j].length < botData.minTweets) {
				botData.twitterResults[i].splice(j, 1);
			};
		}
	};

	for (var x = 0; x < botData.twitterResults.length; x++) {
		for (var y = 0; y < botData.twitterResults[x].length; y++) {
			console.log(" --------------------------- ");
			console.log(botData.twitterResults[x][y][0].word);
			console.log(" --------------------------- ");
			
			for (var z = 0; z < botData.twitterResults[x][y].length; z++) {
				console.log(botData.twitterResults[x][y][z].tweet + " (" + botData.twitterResults[x][y][z].tweet.length + ")");
			}
		}
	}

	cb(null);
}




rateLimitCheck = function(cb) {
	console.log('---------------------------');
    t.get('application/rate_limit_status', {resources: 'search'}, function (err, data, response) {
		if (!err) {
			var dataRoot = data.resources.search['/search/tweets'],
				limit = dataRoot.limit,
				remaining = dataRoot.remaining,
				resetTime = dataRoot.reset + "000",
				currentTime = (new Date).getTime().toString(),
				msRemaining = resetTime - currentTime,
				totalSecsRemaining = Math.floor(msRemaining / 1000),
				minRemaining = Math.floor(totalSecsRemaining/60),
				secRemaining = totalSecsRemaining%60;

			if (secRemaining < 10) { secRemaining = "0" + secRemaining; }

			var timeUntilReset = new Date(0);
			timeUntilReset.setUTCSeconds(dataRoot.reset);

			var hour = timeUntilReset.getHours();
			if (hour > 12) { hour = hour - 12; };
			var min = timeUntilReset.getMinutes();
			if (min < 10) { min = "0" + min; };
			var sec = timeUntilReset.getSeconds();
			if (sec < 10) { sec = "0" + sec; };

			console.log("Rate limit: " + remaining + "/" + limit);
			console.log("Next reset at: " + hour + ":" + min + ":" + sec + " in " + minRemaining + ":" + secRemaining );

			console.log('---------------------------');
			console.log("Total: " + statsTracker.total);
			console.log(JSON.stringify(statsTracker.rejectTracker, null, 2));
		}
	});
}


// ===========================
// Execute
// ===========================
run = function() {
	console.log("========= Starting! =========");

    async.waterfall([
		getRandomWords,
		cleanRandomWords,
		getAllPublicTweets,
		nextFunction,
		rateLimitCheck
    ],
    function(err, botData) {
		if (err) {
			console.log('Error: ', err);
			rateLimitCheck();
		}
    });
}

run();