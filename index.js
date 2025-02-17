const express = require('express');
const cors = require('cors');
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

//middleware
app.use(cors());
app.use(express.json());

console.log("user", process.env.DB_USER, "pass", process.env.DB_PASS)

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.42yqa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db('logixshuvoDB').collection('users');

    // GET ALL USERS DATA
    app.get('/users', async(req, res) => {
        const result = await usersCollection.find().toArray();
        res.send(result);
    })

    // REGISTER A NEW USER
    app.post('/users', async(req, res) =>{
        const {name, email, role} = req.body;

        // check if the user exist or not
        const existingUser = await usersCollection.findOne({email});
        if(existingUser){
            return res.send({ message: "User Already exists", insertedId: null });
        }

        // insert new user
        const newUser = {name, email, role};
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
    })

    // CHANGE USER ROLE

    // DELETE A USER
    app.delete('/users/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('logixshuvo server is running ')
})

app.listen(port, () => {
    console.log(`LogixShuvo server is running on port: ${port}`)
})