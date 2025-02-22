const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.42yqa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db("logixshuvoDB").collection("users");
    const bookedParcelsCollection = client
      .db("logixshuvoDB")
      .collection("bookedParcels");

    // JWT RELATED API
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // MIDDLEWARES
    const verifyToken = (req, res, next) => {
      // console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.send(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // VERIFY ADMIN
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // GET ALL USERS
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // GET ALL DELIVERYMAN USERS
    app.get(
      "/users/deliveryman",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const query = { role: "deliveryman" };
        const result = await usersCollection.find(query).toArray();
        res.send(result);
      }
    );

    // REGISTER A NEW USER
    app.post("/users", async (req, res) => {
      const { name, email, role } = req.body;

      // check if the user exist or not
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        return res.send({ message: "User Already exists", insertedId: null });
      }

      // insert new user
      const newUser = { name, email, role };
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    // CHANGE USER ROLE
    app.patch("/users/role/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: { role },
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      if (result.modifiedCount > 0) {
        res.send({ success: true, modifiedCount: result.modifiedCount });
      } else {
        res.send({ success: false, message: "No changes made" });
      }
    });

    // GET IS ADMIN
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded?.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // GET IS DELIVERYMAN
    app.get("/users/deliveryman/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded?.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let deliveryman = false;
      if (user) {
        deliveryman = user?.role === "deliveryman";
      }
      res.send({ deliveryman });
    });

    // VERIFY DELIVERY MAN
    const verifyDeliveryman = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email });
      if (!user || user?.role !== "deliveryman") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    // DELETE A USER
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    // POST BOOKED PARCEL
    app.post("/bookedParcels", async (req, res) => {
      const parcel = req.body;
      const result = await bookedParcelsCollection.insertOne(parcel);
      res.send(result);
    });

    // GET ALL BOOKED PARCELS
    app.get("/bookedParcels", async (req, res) => {
      const result = await bookedParcelsCollection.find().toArray();
      res.send(result);
    });

    // GET USER EMAIL BASED BOOKED PARCELS
    app.get("/parcels", async (req, res) => {
      try {
        const userEmail = req.query.email; 
        if (!userEmail) {
          return res.status(400).json({ message: "Email is required" });
        }
        const parcels = await bookedParcelsCollection.find({ email: userEmail }).toArray();
        res.json(parcels);
      } catch (error) {
        res.status(500).json({ message: "Server error", error });
      }
    });

    // CANCEL A PARCEL BY USER
    app.delete("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        
        const result = await bookedParcelsCollection.deleteOne(query);
        
        if (result.deletedCount === 1) {
          res.json({ success: true, message: "Parcel deleted successfully" });
        } else {
          res.status(404).json({ success: false, message: "Parcel not found" });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("logixshuvo server is running ");
});

app.listen(port, () => {
  console.log(`LogixShuvo server is running on port: ${port}`);
});
