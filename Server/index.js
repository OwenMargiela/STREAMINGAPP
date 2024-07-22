const express = require('express')
const upload = require('./multer_serverless.js')

const app = express()
const port = 3000;

require('dotenv').config()

require('dotenv').config()

const { EventHubProducerClient } = require("@azure/event-hubs");

const eventHubName = "urls";

/**
 * 
 * @param {string} url 
 */
async function sendMessage(url) {
    const producer = new EventHubProducerClient(process.env.CONNECTIONSTRING, eventHubName);

    try {
        const batch = await producer.createBatch();
        batch.tryAdd({ body: url });

        await producer.sendBatch(batch);
        console.log("Message sent successfully.");
    } catch (err) {
        console.error("Error sending message: ", err);
    } finally {
        await producer.close();
    }
}
module.exports = {
    sendMessage
}

const { client, connect_to_DB, upload_by_chunks, upload_mongo_db } = require('./db_storage_transaction.js')
//const { sendMessage } = require('./kafka_prod.js')
console.log(`Trying to connect:`)
//connect_to_DB(client)


app.post('/api/upload', upload.single('file'), async (req, res) => {

    console.log("listening for request...")

    if (!req.file || !req.body) {
        return res.status(404).json({ error: "Invalid response object..." })

    }

    try {
        const { originalname, buffer, size, mimetype, } = req.file
        const { title, description, user_data } = req.body

        console.log(process.env.CONTAINER_NAME)

        const url = await upload_by_chunks(originalname, buffer)
        console.log(url)
        sendMessage(url);
        res.status(200).json([{ msg: "Upload Succesfull" }, req.body, req.file])

        /*
        const { UserRef } = require("./mongoose/data_models")
        const mongoose = require('mongoose');
        const randomUser = new UserRef({
            user_ID: new mongoose.Types.ObjectId(),
            channel_URL: `https://www.example.com/${generateRandomString(5)}`,
            channel_Avatar: `https://www.example.com/avatars/${generateRandomString(5)}.jpg`,
            user_handle: '@' + generateRandomString(8)
        });
        */

        //const url = `https://StreamSite.com/${randomUser.user_handle}v?=${generateRandomString(14)}`


        //sendMessage(url)

        //await upload_mongo_db(url, randomUser)

        //console.log(url)

        //console.log(`Name : ${originalname}\nSize : ${size}\nMimetype: ${mimetype}\nTitle: ${title}\nDescription: ${description} \n`)


    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ error: 'Internal server error' });
    }

})

app.listen(port, () => {
    console.log(`Listening on port ${port}`)
})



function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}