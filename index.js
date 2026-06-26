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

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
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

        // delete data from requests
        app.delete('/request/:id', async (req, res) => {
            const id = req.params.id;
            const result = await requestCollection.deleteOne({ _id: new ObjectId(id) });

            res.send(result)
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


        // payment with stripe
        app.post('/create-checkout-session', async (req, res) => {
            try {
                const { amount } = req.body;

                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    mode: 'payment',

                    line_items: [
                        {
                            price_data: {
                                currency: 'usd',
                                product_data: {
                                    name: 'Loan Payment',
                                },
                                unit_amount: amount * 100,
                            },
                            quantity: 1,
                        },
                    ],
                    metadata: {
                        loanId: req.body.loanId,
                        amount: amount,
                    },
                    success_url: `${process.env.SITE_DOMAIN}/payment-success?loanId=${req.body.loanId}&amount=${amount}`,
                    cancel_url: `${process.env.SITE_DOMAIN}/payment-cancel`,
                });

                res.send({ url: session.url });
            } catch (error) {
                console.log(error);
                res.status(500).send({ error: "Payment session failed" });
            }
        });

        app.patch('/update-payment/:id', async (req, res) => {
            const id = req.params.id;
            const { amount } = req.body;
            const loan = await requestCollection.findOne({ _id: new ObjectId(id) });
            if (!loan) {
                return res.status(404).send({ error: "Loan not found" });
            }
            const newPaidAmount = loan.paidAmount + amount;
            const totalAmount = loan.amount;
            let updateDoc = {
                $inc: { paidAmount: amount }
            };
            if (newPaidAmount >= totalAmount) {
                updateDoc.$set = { status: "completed" };
            }
            const result = await requestCollection.updateOne(
                { _id: new ObjectId(id) },
                updateDoc
            );
            res.send(result);
        });

        // save or update a user in db
        app.post('/user', async (req, res) => {
            const userData = req.body;
            userData.created_at = new Date().toISOString()
            userData.last_loggedIn = new Date().toISOString()
            userData.role = 'customer'

            const query = { email: userData.email, }

            const alreadyExists = await usersCollection.findOne( query )

            if (alreadyExists) {
                const result = await usersCollection.updateOne(query, {
                    $set: {
                        last_loggedIn: new Date().toISOString(),
                    }
                })
                return res.send(result)
            }

            const result = await usersCollection.insertOne(userData);

            res.send(result);
        })


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