require('dotenv').config()
const { PassThrough } = require('stream')

const multer = require('multer')
const upload = multer({
    storage: multer.memoryStorage(),
})


const express = require('express')
const app = express()
const port = 3000;

const { azure } = require('../uploadAzureFunctions')
const Producer = require('../kafka/producer/producer')


azure.setBlobWithAccountNameAndSasToken(process.env.ACCOUNT_NAME, process.env.SAS_TOKEN)




app.post('/api/upload', upload.single('file'), async (req, res) => {

    console.log("listening for request...")

    if (!req.file || !req.body) {
        return res.status(404).json({ error: "Invalid response object..." })
    }

    try {
        const { originalname, buffer, size, mimetype, } = req.file
        const { title, description, user_data } = req.body
        const bufferStream = new PassThrough()
        bufferStream.write(buffer)
        bufferStream.end()

        const url = await azure.uploadStreamToAzure(originalname, bufferStream, process.env.CONTAINER_NAME)

        console.log("URL: ", url)
        Producer.sendMessage(url)
        res.status(200).json([{ msg: "Upload Succesfull" }, req.body, req.file])



    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ error: 'Internal server error' });
    }

})

app.listen(port, () => {
    console.log(`Listening on port ${port}`)
})
