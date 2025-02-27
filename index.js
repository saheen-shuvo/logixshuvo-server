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
    // await client.connect();

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
      const { name, email, role, phone } = req.body;

      // check if the user exist or not
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        return res.send({ message: "User Already exists", insertedId: null });
      }

      // insert new user
      const newUser = { name, email, role, phone };
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    // CHANGE USER ROLE BY ADMIN
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

    // DELETE A USER BY ADMIN
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    // COUNT DELIVERED PARCELS FOR A DELIVERYMAN
    app.get('/parcelsDelivered/:deliveryManId', verifyToken, async(req, res) => {
      const {deliveryManId } = req.params;
      try{
        const objectId = new ObjectId(deliveryManId);
        const count = await bookedParcelsCollection.countDocuments({
          deliveryManId: objectId,
          deliveryStatus: "delivered"
        });
        res.send({success: true, count});
      } catch (error){
        console.error("Error fetching delivered count:", error);
        res.status(500).send({ success: false, message: "Server error", error });
      }
    })

    // POST BOOKED PARCEL BY USER
    app.post("/bookedParcels", async (req, res) => {
      const parcel = req.body;
      const result = await bookedParcelsCollection.insertOne(parcel);
      res.send(result);
    });

    // GET ALL BOOKED PARCELS BY USER
    app.get("/bookedParcels", async (req, res) => {
      const result = await bookedParcelsCollection.find().toArray();
      res.send(result);
    });

    // GET ASSIGNED PARCELS FOR A DELIVERYMAN
    app.get("/myassignedparcels", verifyToken, async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) {
          return res.status(400).json({ message: "Email is Required" });
        }
        const deliveryman = await usersCollection.findOne({ email });
        if (!deliveryman || deliveryman.role !== "deliveryman") {
          return res.status(404).json({ message: "Deliveryman not found" });
        }
        const parcels = await bookedParcelsCollection
          .find({ deliveryManId: new ObjectId(deliveryman._id) })
          .toArray();
        res.status(200).json(parcels);
      } catch (error) {
        console.error("Error fetching booked parcels:", error);
        res.status(500).json({ message: "Server Error", error });
      }
    });

    // UPDATE DELIVERY STATUS BY DELIVERY MAN
    app.patch("/updateStatus/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const { deliveryStatus } = req.body;
      if (!deliveryStatus) {
        return res
          .status(400)
          .send({ success: false, message: "Delivery status is required" });
      }
      try {
        const result = await bookedParcelsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { deliveryStatus } }
        );
        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Status updated successfully" });
        } else {
          res.status(400).send({ success: false, message: "No changes made" });
        }
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Server error", error });
      }
    });

    // UPDATE BOOKED PARCEL BY ADMIN
    app.patch("/bookedParcels/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { deliveryStatus, deliveryManId, approximateDeliveryDate } =
          req.body;

        const result = await bookedParcelsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              deliveryStatus,
              deliveryManId: new ObjectId(deliveryManId),
              approximateDeliveryDate,
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Parcel not found" });
        }

        res.status(200).json({
          message: "Parcel updated successfully",
          result,
        });
      } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Error updating parcel", error });
      }
    });

    // GET USER EMAIL BASED BOOKED PARCELS
    app.get("/parcels", async (req, res) => {
      try {
        const userEmail = req.query.email;
        if (!userEmail) {
          return res.status(400).json({ message: "Email is required" });
        }
        const parcels = await bookedParcelsCollection
          .find({ email: userEmail })
          .toArray();
        res.json(parcels);
      } catch (error) {
        res.status(500).json({ message: "Server error", error });
      }
    });

    // GET PARCEL ID BASED
    app.get("/parcels/:id", async (req, res) => {
      const { id } = req.params;
      const result = await bookedParcelsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // PARCEL UPDATE BY USER
    app.put("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        let updatedData = req.body;
        delete updatedData._id;
        const filter = { _id: new ObjectId(id) };
        const update = { $set: updatedData };
        const result = await bookedParcelsCollection.updateOne(filter, update);
        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Parcel not found" });
        }
        res.json({ success: true, modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error("Error updating parcel:", error);
        res.status(500).json({ error: "Server error", details: error.message });
      }
    });

    // CANCEL A PARCEL BY USER
    app.delete("/parcels/:id", verifyToken, async (req, res) => {
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
        res
          .status(500)
          .json({ success: false, message: "Server error", error });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
