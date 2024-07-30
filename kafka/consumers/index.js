require('dotenv').config();

const { EventHubConsumerClient, earliestEventPosition, latestEventPosition } = require("@azure/event-hubs");
const { fullPipeline, convertPipeline, uploadStreamToAzure } = require('./audioController.js');
const fs = require('fs');
const { PassThrough } = require('stream');

//const connectionString = String(process.env.CONNECTIONSTRING);
const eventHubName = "urls";
const consumerGroup = EventHubConsumerClient.defaultConsumerGroupName;

async function receiveMessages() {
    const consumerClient = new EventHubConsumerClient(consumerGroup, process.env.CONNECTIONSTRING, eventHubName);

    consumerClient.subscribe({
        processEvents: async (events, context) => {
            for (const event of events) {
                let eventData;
                try {
                } catch (error) {
                    eventData = event.body.toString(); // Fall back to string if JSON parsing fails
                }

                console.log(`Received event: ${event.body}`);
                if (event.body === undefined) {
                    console.log("event data is undefined, Pipeline will not be executed")
                }
                else {
                    console.log('Executing Pipeline')
                    const metaData = fullPipeline(event.body)
                    const [transcript, webVTT] = convertPipeline(metaData.filename)

                    const webVTTStream = new PassThrough()
                    webVTTStream.write(webVTT)
                    webVTTStream.end()

                    uploadStreamToAzure(metaData.filename, webVTTStream, 'videocaptions')


                    //console.log("Filname: ", metaData.filename)
                }

            }
        },
        processError: async (err, context) => {
            console.error(`Error processing events: ${err}`);
        }
    }, { startPosition: latestEventPosition });

    // Handling process termination signals to close the consumer client gracefully
    const shutdown = async () => {
        console.log("Shutting down consumer client...");
        await consumerClient.close();
        process.exit();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

receiveMessages();
