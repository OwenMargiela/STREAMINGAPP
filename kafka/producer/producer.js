const { EventHubProducerClient } = require("@azure/event-hubs");
const eventHubName = "urls";

class Producer {
    #producer
    constructor() {
        this.#producer = new EventHubProducerClient(process.env.CONNECTIONSTRING, eventHubName);
    }
    /**
     *
     * @param {string} url
     */
    async sendMessage(url) {

        if (!this.#producer) {
            console.log("Something weird happened in the producer function");
        }

        try {
            const batch = await this.#producer.createBatch();
            console.log("Sending: ", url);
            batch.tryAdd({ body: url });

            await this.#producer.sendBatch(batch);
            console.log("Message sent successfully.");
        } catch (err) {
            console.error("Error sending message: ", err);
        } finally {
            await this.#producer.close();
        }
    }
}


const producerInstance = new Producer

module.exports = producerInstance