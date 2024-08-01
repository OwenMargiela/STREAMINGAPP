require('dotenv').config()

const https = require('https')
const fs = require('fs');
const { pipeline, PassThrough, } = require('stream')



const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const _AZURE = require("@azure/storage-blob")

const cognitiveService = require('microsoft-cognitiveservices-speech-sdk');
const blobServiceClient = new _AZURE.BlobServiceClient(
    `https://${process.env.ACCOUNT_NAME}.blob.core.windows.net?${process.env.SAS_TOKEN}`
)

const containerClient = blobServiceClient.getContainerClient(process.env.AUDIO_CONTAINER_NAME)


/**
 * @typedef {Object} FileMetaData
 * @property {string} filename - The filename of the file.
 * @property {string} dest - The destination path of the file.
 */

/**
 * @typedef {Object} WordLevelTimestamp
 * @property {number} offset - The offset of the word in ticks (1 tick = 100 nanoseconds)
 * @property {number} duration - The duration of the word in ticks
 * @property {string} text - The text of the word
 * 
 */

/**
 *@typedef {Object} TranscribedAudioResults
 * @property {WordLevelTimestamp[]} timestamps
 * @property {cognitiveService.SpeechRecognitionResult[]} speechResults
 */


/**
 * Uploads a stream to Azure Blob Storage in chunks.
 * 
 * @param {string} filename - The name of the file to upload.
 * @param {PassThrough} stream - The stream containing the file data.
 * @param {string} dest - The destination container name.
 * @returns {Promise<string>} - The URL of the uploaded file.
 */
async function uploadStreamToAzure(filename, stream, dest) {
    console.log("destination:", dest);
    console.log("filename:", filename);
    console.log("filename type:", typeof filename);

    const blockIDs = [];
    const captionContainerClient = blobServiceClient.getContainerClient(dest)
    const blockBlobClient = captionContainerClient.getBlockBlobClient(filename);


    let blockNumber = 0;
    const blockSize = 4 * 1024 * 1024;
    const bufferArray = [];

    stream.on('data', chunk => {
        bufferArray.push(chunk);
    });

    stream.on('error', (err) => {
        console.error('Stream error:', err);
    });

    stream.on('end', async () => {
        const buffer = Buffer.concat(bufferArray);
        let offset = 0;

        while (offset < buffer.length) {
            const chunk = buffer.slice(offset, Math.min(offset + blockSize, buffer.length));
            const blockID = generateID(blockNumber);
            blockIDs.push(blockID);

            await blockBlobClient.stageBlock(blockID, chunk, chunk.length);
            blockNumber++;
            offset += chunk.length;
        }
        await blockBlobClient.commitBlockList(blockIDs, {
            blobHTTPHeaders: { blobContentType: 'text/vtt' }
        });

        //console.log('File uploaded to:', file_URL);
        const file_URL = `https://${process.env.ACCOUNT_NAME}.blob.core.windows.net/${dest}/${filename}`;

        return new Promise((resolve, reject) => {
            resolve(file_URL);
        })
    })
}

/**
 * @param {fs.ReadStream} input A readable stream object
 * @returns {PassThrough} Returns a transform Stream object with a writable end and a readable end
 */

function extractAudio(input) {

    const ffmpegStream = new PassThrough
    const outputStream = new PassThrough

    ffmpeg(input)
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .format('wav')
        .on('end', () => {
            console.log('Audio extraction complete.');
        })
        .on('error', (err) => {
            console.error('Error extracting audio:', err);
        })
        .pipe(ffmpegStream);

    pipeline(
        ffmpegStream,
        outputStream,
        (err) => {
            if (err) {
                console.error('Pipeline error:', err);
            } else {
                console.log('Pipeline completed successfully!');
            }

        }

    )

    return outputStream
}


/**
 * 
 * @param {string} blobname 
 * @returns {Promise<NodeJS.ReadableStream>}
 */
async function downloadAudioFromAzure(blobname) {
    const { decode } = require('wav-decoder');

    const blockBlobClient = containerClient.getBlobClient(blobname)
    const blobresponse = await blockBlobClient.download(0)

    const chunks = [];
    const stream = blobresponse.readableStreamBody;

    stream.on('data', (chunk) => chunks.push(chunk));

    stream.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        try {
            const wavData = await decode(buffer);
            console.log('Audio Format:', wavData.sampleRate, 'Hz');
            console.log('Channels:', wavData.channelData.length);
            console.log('Bit Depth:', wavData.bitDepth);
        } catch (err) {
            console.error('Error decoding WAV file:', err);
        }
    });
    stream.on('error', (err) => console.error('Error reading stream:', err));

    return blobresponse.readableStreamBody;
}



/**
 * @param {NodeJS.ReadableStream} stream
 * @returns {Promise<[cognitiveService.SpeechRecognitionResult[], WordLevelTimestamp[]]>}
 * 
 */
function transcribeAudio(stream) {

    console.log(`Type of Stream: ${stream.constructor.name} `)
    console.log(`Service Key: ${process.env.SPEECH_SERVICE_KEY}\nRegion: ${process.env.REGION}\nAudio: ${process.env.AUDIO_CONTAINER_NAME}`)

    const speechConfig = cognitiveService.SpeechConfig.fromSubscription(process.env.SPEECH_SERVICE_KEY, process.env.REGION)
    const pushStream = cognitiveService.AudioInputStream.createPushStream()

    let totalSize = 0; // Track total size
    let receivedSize = 0; // Track received size

    const updateStreamingProgress = () => {
        if (totalSize > 0) {
            const percentage = Math.round((receivedSize / totalSize) * 100);
            process.stdout.write(`\rStreaming Progress: ${percentage}% (${receivedSize} bytes)`);
        }
    };

    //let end = true
    //while (!end) {

    stream.on('data', (chunk) => {
        pushStream.write(chunk);
        receivedSize += chunk.length;
        updateStreamingProgress();
        // Update progress
    });

    stream.on('end', () => {
        pushStream.close();
        console.log('\nDownload complete');
        process.stdout.write(`\rStreaming complete. Total size: ${receivedSize} bytes\n`)
        end = true
    });
    //}

    // Get total size of the stream (if possible)
    stream.on('response', (response) => {
        totalSize = parseInt(response.headers['content-length'], 10);
    });


    const audioConfig = cognitiveService.AudioConfig.fromStreamInput(pushStream)

    speechConfig.outputFormat = cognitiveService.OutputFormat.Detailed
    speechConfig.requestWordLevelTimestamps()
    speechConfig.setProperty(cognitiveService.PropertyId.SpeechServiceResponse_StablePartialResultThreshold = 5)

    const recognizer = new cognitiveService.SpeechRecognizer(speechConfig, audioConfig)

    /**
     * @type {WordLevelTimestamp[]}
     */
    const wordLevelTimestamps = []

    const results = new Array(new cognitiveService.SpeechRecognitionResult)

    return new Promise((resolve, rejects) => {

        recognizer.recognizing = (sender, event) => {
        }

        recognizer.recognized = (sender, event) => {
            console.log(`\rRecognition in progress...`);
            if (event.result.reason === cognitiveService.ResultReason.RecognizedSpeech) {
                //console.log('\n\nRecognized:', event.result.text);
                results.push(event.result)
                /**
                 * @type {WordLevelTimestamp[]}
                */
                wordLevelTimestamps.push(...JSON.parse(event.result.json).NBest[0].Words)
                //console.log(wordLevelTimestamps)
                console.log(wordLevelTimestamps[wordLevelTimestamps.length - 1])
            }
        }



        recognizer.sessionStopped = (sender, event) => {
            recognizer.stopContinuousRecognitionAsync(
                () =>
                    resolve([results, wordLevelTimestamps]),
                (err) => rejects(new Error(`Error stopping recognition: ${err}`))
            );
        };

        recognizer.canceled = (sender, event) => {
            if (event.errorDetails) {
                rejects(new Error(`Recognition canceled: ${event.errorDetails}`));
            } else if (event.errorDetails === undefined) {
                console.log("Resolving word-level-timestamps with undefined error details")
                resolve([results, wordLevelTimestamps])
            }
            recognizer.stopContinuousRecognitionAsync(
                () => { },
                (err) => rejects(new Error(`Error stopping recognition: ${err}`))
            );
        };

        recognizer.startContinuousRecognitionAsync(
            () => console.log('Recognition started.'),
            (err) => {
                console.log('Error starting recognition:', err);

            }
        );

    })

}

/**
 * @param {cognitiveService.SpeechRecognitionResult[]} results
 * @returns {string}
 */

/**
 * Optimizes captions based on word-level timestamps
 * @param {WordLevelTimestamp[]} words - Array of words with their timestamps
 * @returns {string} The webVTT content
 */
/**
 * Converts an array of word objects into WebVTT format with cues limited to 5 seconds.
 * @param {Object[]} words - Array of word objects with `Word`, `Offset`, and `Duration` properties.
 * @returns {string} - The WebVTT formatted content.
 */
function WebVTTBuilder(words) {
    let vttContent = "WEBVTT\n\n";
    let currentCue = [];
    let currentDuration = 0;
    let cueIndex = 0;

    for (const word of words) {
        const wordDuration = word.Duration / 10000000; // Convert from 100-nanoseconds to seconds

        if (currentDuration + wordDuration > 5) {
            // Process the current cue and reset
            vttContent += processCue(currentCue, cueIndex);
            currentCue = [];
            currentDuration = 0;
            cueIndex++;
        }

        currentCue.push(word);
        currentDuration += wordDuration;
    }

    // Process any remaining words in the last cue
    if (currentCue.length > 0) {
        vttContent += processCue(currentCue, cueIndex);
    }

    return vttContent;
}

/**
 * Processes an array of word objects into a WebVTT cue.
 * @param {Object[]} cue - Array of word objects.
 * @param {number} index - The cue index.
 * @returns {string} - The WebVTT cue string.
 */
function processCue(cue, index) {
    let cueContent = '';
    if (cue.length === 0) return cueContent;

    // Determine the start and end times
    const startTime = cue[0].Offset / 10000000; // Convert from 100-nanoseconds to seconds
    const endTime = cue[cue.length - 1].Offset + cue[cue.length - 1].Duration;
    const endTimeSeconds = endTime / 10000000; // Convert to seconds

    // Format start and end times for WebVTT
    const startTimeStr = formatTime(startTime);
    const endTimeStr = formatTime(endTimeSeconds);

    // Build the WebVTT cue
    cueContent += `${index + 1}\n${startTimeStr} --> ${endTimeStr}\n`;
    cueContent += cue.map(word => word.Word).join(' ') + '\n\n';

    return cueContent;
}

/**
 * Formats a time value in seconds to the WebVTT time format (HH:MM:SS.MS).
 * @param {number} time - Time in seconds.
 * @returns {string} - Formatted time string.
 */
function formatTime(time) {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = (time % 60).toFixed(3);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(6, '0').replace('.', ',')}`;
}


/**
 * @typedef {Object} ProcessedTranscript
 * @param {string} rawText
 * @param {string} webVTT
 */

/**
 * Produces a Script as well of a WebVTT file containing the video's audio contents 
 * in the form of text
 * @param {string} blobname -The name of the blob containing the disired audio content
 * @return {Promise<string[]>}
*/

async function convertPipeline(blobname) {

    let TranscriptBuilder = ""
    let webVTT = ""

    /**
     * @type {NodeJS.ReadableStream}
     */
    let audioStream
    await downloadAudioFromAzure(blobname).then(res => {
        audioStream = res
    })

    if (audioStream) {
        return new Promise((resolve, rejects) => {

            transcribeAudio(audioStream)
                .then(res => {
                    console.log("Building File")
                    webVTT = WebVTTBuilder(res[1])

                    for (let i = 1; i < res[0].length; i++) {
                        //Regex that replaces every period with a new line excluding all those that separate acronyms,decimals,titles and the like
                        let format = res[0][i].text.replace(/(?<!\b[A-Z])(?<!\d)(?<!\b(?:Inc|Ltd|Jr|Dr|Ms|Mr|St|Ave|etc|e\.g|i\.e|a\.k|p\.m|a\.m))\.(?=\s|$)/g, '.\n\n');
                        TranscriptBuilder += format
                    }
                    const normalizeText = (text) => {
                        return text
                            .split("\n") // Split the text into lines
                            .map((line) => line.trimStart()) // Remove leading spaces from each line
                            .join("\n"); // Join the lines back together
                    };
                    resolve([TranscriptBuilder, webVTT])

                })
                .catch(err => rejects(`Error converting WAV file ${err}`))


        })
    }
}

// Check if the script is run directly from the command line
if (require.main === module) {
    // Get the command-line arguments
    const args = process.argv.slice(2);

    if (args.length !== 1) {
        console.error('Usage: node convertPipeline <blobname>');
        process.exit(1);
    }

    // Call the function with the provided argument
    convertPipeline(args[0])
        .then(() => console.log('Processing complete.'))
        .catch(err => console.error('Error:', err));
}



/**
 * Extracts the audio content of a video using its URL. The audio is then uploaded to a storage bucket.
 * @param {string} url - The URL of the uploaded video.
 * @return {Promise<FileMetaData>}
 */
async function fullPipeline(url) {
    console.log('In Pipeline');
    console.log(url);
    const dest = 'audio';
    console.log('Dest:', dest);

    const readStream = new PassThrough();


    https.get(url, (res) => {
        res.pipe(readStream);
        res.on('error', (err) => {
            console.error('Error with HTTP request:', err);
            reject(err);
        });
    }).on('error', (err) => {
        console.error('Error with HTTP request:', err);
        reject(err);
    });

    readStream.on('finish', () => {
        console.log("File Downloaded");
    }).on('error', (err) => {
        console.error('Error downloading file:', err);
    });

    // Extract audio from the stream
    console.log("extracting audio")
    const audioStream = extractAudio(readStream);

    // Assuming extractAudio always returns a valid stream
    const urlparts = url.split('/')[4].split("");
    urlparts.splice(urlparts.length - 3, 3);
    const filename = urlparts.join('') + "wav";

    // Upload audio stream to Azure
    uploadStreamToAzure(filename, audioStream, dest)

    /**
     * @type {FileMetaData}
     */
    const file = { filename: filename, dest: dest };
    //console.log(file)
    return file


}



function generateID(blockNumber) {
    const prefix = 'block-'
    let bloackId = prefix + blockNumber.toString().padStart(5, '0')
    bloackId = Buffer.from(bloackId, 'utf-8').toString('base64')
    return bloackId
}

module.exports = {
    fullPipeline,
    convertPipeline,
    uploadStreamToAzure

}
