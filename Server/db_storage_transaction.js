const mongoose = require('mongoose');
const AZURE = require("@azure/storage-blob")
const { MongoClient, ServerApiVersion } = require('mongodb');
const { DefaultAzureCredential } = require('@azure/identity');
require('dotenv').config()

const mongodb_URI = process.env.MONGODB_URI;

const accountName = process.env.ACCOUNT_NAME;
const sasToken = process.env.SAS_TOKEN;
const containerName = process.env.CONTAINER_NAME;
//console.log("SAS: ", sasToken)

//const containerClient = AZURE.BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING).getContainerClient(process.env.containerName);

const blobServiceClient = new AZURE.BlobServiceClient(
    `https://${accountName}.blob.core.windows.net?${sasToken}`

)

const containerClient = blobServiceClient.getContainerClient(containerName)

const client = new MongoClient(mongodb_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


async function connect_to_DB(mongoClient) {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        await client.close();
    }

}

/*
async function upload_mongo_db(url, user, title, description) {
    console.log(`Video url: ${url}`)
    console.log(`connecting\ntrying to insert ${user}`)
    await mongoose.connect(mongodb_URI)
    if (mongoose.connection.readyState === 1) {
        console.log('Mongoose connection is open.');
        
        try {

        const { VideoMetadataRef, Comment } = require("./mongoose/data_models")
        const newVideo = new VideoMetadataRef({
            number_of_likes: 0,
            number_of_dislikes: 0,
            comment_section_ID: 'comment123',
            title: title,
                description: description,
                author: user,
                length: 300,
                video_ID: new mongoose.Types.ObjectId(),
                URL: url
            });
            
            // Save the video
            await newVideo.save();
            
            console.log('New video created successfully:', newVideo);
            
            
        } catch (error) {
            console.log(`${error}\n`);
            const parts = url.split("/")
            const parsedBlobnameVal = parts[4]
            
            console.log(`Deleting ${parsedBlobnameVal}`)

            blobClient = containerClient.getBlockBlobClient(parsedBlobnameVal)

            await blobClient.delete()
            console.log(`Deleted ${parsedBlobnameVal} successfully`)
        } finally {
            console.log('Closing connection')
            mongoose.connection.close()
        }
        
    } else {
        console.log('Mongoose connection is not open.');

    }

}
*/


/**
 * 
 * @param {string} filename 
 * @param {Buffer} buffer 
 * @param {string} dest 
 * @returns {string}
 */
async function upload_by_chunks(filename, buffer) {
    if (!containerClient) {
        console.log("Something weird Happend")
    }
    buffer = Buffer.from(buffer)
    console.log(buffer instanceof Buffer);

    const blockIDs = []
    const blockBlobClient = containerClient.getBlockBlobClient(filename)

    let offset = 0
    let blockNumber = 0
    const blockSize = 4 * 1024 * 1024

    while (offset < buffer.length) {
        const chunk = buffer.slice(offset, Math.min(offset + blockSize, buffer.length))
        const blockID = generateID(blockNumber)
        blockIDs.push(blockID)

        await blockBlobClient.stageBlock(blockID, chunk, chunk.length)
        blockNumber++
        offset += chunk.length;
    }
    await blockBlobClient.commitBlockList(blockIDs)

    const file_URL = `https://${accountName}.blob.core.windows.net/video/${filename}`
    return file_URL
}



function generateID(blockNumber) {
    const prefix = 'block-'
    let bloackId = prefix + blockNumber.toString().padStart(5, '0')
    bloackId = Buffer.from(bloackId, 'utf-8').toString('base64')
    return bloackId
}


module.exports = {
    //blobServiceClient,
    containerClient,
    connect_to_DB,
    upload_by_chunks,
    client,
    //upload_mongo_db,
}