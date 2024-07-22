require('dotenv').config();

const { EventHubConsumerClient, earliestEventPosition, latestEventPosition } = require("@azure/event-hubs");
const { fullPipeline } = require('./audioController.js');

const connectionString = String(process.env.CONNECTIONSTRING);
const eventHubName = "urls";
const consumerGroup = EventHubConsumerClient.defaultConsumerGroupName;

async function receiveMessages() {
    const consumerClient = new EventHubConsumerClient(consumerGroup, connectionString, eventHubName);

    consumerClient.subscribe({
        processEvents: async (events, context) => {
            for (const event of events) {
                let eventData;
                try {
                } catch (error) {
                    eventData = event.body.toString(); // Fall back to string if JSON parsing fails
                }

                console.log(`Received event: ${eventData}`);
                console.log('Executing Pipeline')
                const metaData = fullPipeline(eventData)
                metaData.filename

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
