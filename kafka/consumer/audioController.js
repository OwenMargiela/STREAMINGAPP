const _AZURE = require("@azure/storage-blob")

const { pipeline, PassThrough, Readable } = require('stream')
const ffmpeg = require('fluent-ffmpeg');

const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { default: axios } = require('axios');

const fs = require('fs');

require('dotenv').config()
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const cognitiveService = require('microsoft-cognitiveservices-speech-sdk');

const blobServiceClient = new _AZURE.BlobServiceClient(
    `https://${process.env.ACCOUNT_NAME}.blob.core.windows.net?${process.env.SAS_TOKEN}`

)

const containerClient = blobServiceClient.getContainerClient(process.env.AUDIO_CONTAINER_NAME)

/**
 * @class
 */

class FileMetaData {
    /**
     * 
     * @param {string} filename 
     * @param {string} dest 
     */
    constructor(filename, dest) {
        /**
         * @type {string}
         */
        this.filename = filename
        /**
         * @type {string}
         */
        this.dest = dest
    }
}


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
    const blockBlobClient = containerClient.getBlockBlobClient(filename);

    let blockNumber = 0;
    const blockSize = 4 * 1024 * 1024;
    const bufferArray = [];

    stream.on('data', chunk => {
        bufferArray.push(chunk);
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
            blobHTTPHeaders: { blobContentType: 'audio/mpeg' } // Set the content type to audio/mpeg
        });

        const file_URL = `https://${process.env.ACCOUNT_NAME}.blob.core.windows.net/${dest}/${filename}`;
        console.log('File uploaded to:', file_URL);
        return file_URL;
    });

    stream.on('error', (err) => {
        console.error('Stream error:', err);
    });
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
 * Downloads data from a PassThrough stream and saves it locally to a file.
 * @param {import('stream').Readable} stream - The PassThrough stream containing the data to download.
 * @param {string} filePath - The path where the file should be saved.
 * @returns {Promise<void>} - A promise that resolves when the file is successfully saved.
 * 
 * 
 */
async function downloadFromStream(stream) {

    const filePath = __dirname + "/audio.wav";

    return new Promise((resolve, reject) => {
        const writableStream = fs.createWriteStream(filePath);

        // Pipe the PassThrough stream to the writable file stream
        stream.pipe(writableStream);

        // Handle events to track the completion or error of the download
        stream.on('end', () => {
            console.log('Download completed.');
            resolve();
        });

        stream.on('error', (err) => {
            console.error('Error downloading:', err);
            reject(err);
        });

        writableStream.on('finish', () => {
            console.log('File saved successfully:', filePath);
        });

        writableStream.on('error', (err) => {
            console.error('Error saving file:', err);
            reject(err);
        });
    });
}

/**
 * 
 * @param {string} blobname 
 * @returns {Promise<NodeJS.ReadableStream>}
 */
async function downloadAudioFromAzure(blobname) {
    const blockBlobClient = containerClient.getBlobClient(blobname)
    const blobresponse = await blockBlobClient.download(0)
    return blobresponse.readableStreamBody
}


/**
 * @param {NodeJS.ReadableStream} stream
 * @returns {Promise<cognitiveService.SpeakerRecognitionResult>}
 */
async function transcribeAudio(stream) {
    const speechConfig = cognitiveService.SpeechConfig.fromSubscription(process.env.SPEECH_SERVICE_KEY, process.env.REGION)
    const audioConfig = cognitiveService.AudioConfig.fromStreamInput(stream)

    speechConfig.outputFormat = cognitiveService.OutputFormat.Detailed

    const recognizer = new cognitiveService.SpeechRecognizer(speechConfig, audioConfig)

    return new Promise((resolve, reject) => {
        const results = []

        recognizer.recognizing = (s, e) => {
            results.push(e.result);
        };

        recognizer.recognized = (sender, event) => {
            if (event.result.reason === cognitiveService.ResultReason.RecognizedSpeech) {
                results.push(event.result)
            }
        }
        recognizer.sessionStopped = (sender, event) => {
            resolve(results)
            recognizer.close

        }
        recognizer.canceled = (sender, event) => {
            reject(event)
            recognizer.close()
        }
        recognizer.startContinuousRecognitionAsync()



    })

}


/**
 *
 *@param {string} eventData Event produced by the eventhub stream containing the url of the image/media/media
 *@return {FileMetaData | undefined}
 */
async function fullPipeline(eventData) {
    console.log('In Pipeline')
    let url = eventData
    console.log(url)
    let dest = 'audio'
    console.log('Dest:', dest)

    try {
        const https = require('https')
        const readStream = new PassThrough()

        https.get(url, (res) => {
            res.pipe(readStream);
            readStream.on('finish', () => {
                console.log("File Downloded")
            }).on('error', (err) => {
                console.error('Error downloading file:', err)
            })
        })
        //const response = await axios.get(url, { responseType: "stream" });
        //console.log("Response: ", response.data)

        const audioStream = extractAudio(readStream);

        if (audioStream) {
            const urlparts = url.split('/')[4].split("")
            urlparts.splice(urlparts.length - 3, 3)
            const filename = urlparts.join('') + "wav"
            //console.log("Filename:", filename)
            await uploadStreamToAzure(filename, audioStream, dest)
            const fileMetaData = new FileMetaData(filename, dest)
            return fileMetaData

        }

        // await downloadFromStream(audioStream); // Ensure to await the download operation
    } catch (error) {
        console.error(`${error}`)
    }

}


function generateID(blockNumber) {
    const prefix = 'block-'
    let bloackId = prefix + blockNumber.toString().padStart(5, '0')
    bloackId = Buffer.from(bloackId, 'utf-8').toString('base64')
    return bloackId
}

module.exports = {
    fullPipeline
}
