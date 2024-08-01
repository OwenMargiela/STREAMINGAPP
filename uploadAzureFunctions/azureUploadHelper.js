
const AZURE = require("@azure/storage-blob");
const { PassThrough } = require('stream')


/**
 * @param { AZURE.BlobServiceClient} blobServiceClient
*/
function AzureInstance(blobServiceClient) {
    this.blobServiceClient = blobServiceClient
}

/**
 * 
 * @param {string} accountName 
 * @param {string} sasToken 
 */

AzureInstance.prototype.setBlobWithAccountNameAndSasToken = function (accountName, sasToken) {
    this.blobServiceClient = new AZURE.BlobServiceClient(`https://${accountName}.blob.core.windows.net?${sasToken}`)
}

/**
 * Uploads a stream to Azure Blob Storage in chunks.
 * 
 * @param {string} filename - The name of the file to upload.
 * @param {PassThrough} stream - The stream containing the file data.
 * @param {string} dest - The destination container name.
 * @returns {Promise<string>} - The URL of the uploaded file.
*/

AzureInstance.prototype.uploadStreamToAzure = async function (filename, stream, dest) {
    console.log("destination:", dest);
    console.log("filename:", filename);
    console.log("filename type:", typeof filename);

    const blockIDs = [];
    const captionContainerClient = this.blobServiceClient.getContainerClient(dest)
    const blockBlobClient = captionContainerClient.getBlockBlobClient(filename);

    let blockNumber = 0;
    const blockSize = 4 * 1024 * 1024;
    const bufferArray = [];

    return new Promise(async (resolve, rejects) => {

        stream.on('data', chunk => {
            bufferArray.push(chunk);
        });

        stream.on('error', (err) => {
            console.error('Stream error:', err);
            rejects()
        });

        stream.on('end', async () => {
            const buffer = Buffer.concat(bufferArray);
            let offset = 0;


            while (offset < buffer.length) {
                const chunk = buffer.slice(offset, Math.min(offset + blockSize, buffer.length));
                const blockID = this.generateID(blockNumber);
                blockIDs.push(blockID);

                await blockBlobClient.stageBlock(blockID, chunk, chunk.length);
                blockNumber++;
                offset += chunk.length;
            }
            await blockBlobClient.commitBlockList(blockIDs, {
                blobHTTPHeaders: { blobContentType: 'text/vtt' }
            });

            //console.log('File uploaded to:', file_URL);
            const url = `https://${process.env.ACCOUNT_NAME}.blob.core.windows.net/${dest}/${filename}`;
            resolve(url)


        })
    })
}

/**
 * 
 * @param {string} blobname 
 * @param {string} container
 * @returns {Promise<NodeJS.ReadableStream>}
 */
AzureInstance.prototype.downloadAudioFromAzure = async function (container, blobname) {
    const { decode } = require('wav-decoder');

    const containerClient = this.blobServiceClient.getContainerClient(container)
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
 * 
 * @param {string} filename 
 * @param {Buffer} buffer 
 * @returns {string}
 */

AzureInstance.prototype.generateID = function (blockNumber) {
    const prefix = 'block-'
    let bloackId = prefix + blockNumber.toString().padStart(5, '0')
    bloackId = Buffer.from(bloackId, 'utf-8').toString('base64')
    return bloackId
}

module.exports = {
    AzureInstance
} 