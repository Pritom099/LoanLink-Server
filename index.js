require('dotenv').config()
const express = require('express');
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = 3000;
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true,
}));
app.use(express.json());


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


async function run() {
    try {
        await client.connect();

        const db = client.db('loanlink')
        const loansCollection = db.collection('loans')
        const requestCollection = db.collection('request')
        const usersCollection = db.collection('users')

        // get all loans from db
        app.get('/loans', async (req, res) => {
            const result = await loansCollection.find().toArray()
            res.send(result)
        })

        app.get('/loans/:id', async (req, res) => {
            const id = req.params.id;
            const result = await loansCollection.findOne({ _id: new ObjectId(id) })
            res.send(result);
        })

        // post data in requests
        app.post('/request', async (req, res) => {
            const data = req.body;
            const loan = {
                ...data,
                status: "pending", 
                paidAmount: 0,
                createdAt: new Date(),
            };
            const result = await requestCollection.insertOne(loan)
            res.send(result);
        })

        // get data from requests
        app.get('/my-loans/:email', async (req, res) => {
            const email = req.params.email;
            const loans = await requestCollection.find({ email: email }).toArray();

            res.send(loans);
        })

        // get all data requests for admin
        app.get('/request', async (req, res) => {
            const result = await requestCollection.find().toArray();
            res.send(result);
        })

        app.patch('/approve-loan/:id', async (req, res) => {
            const id = req.params.id;

            const result = await requestCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: { status: "active" }
                }
            );

            res.send(result);
        });

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        //await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Server is running');
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});