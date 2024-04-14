const express = require("express")
const {body, validationResult} = require("express-validator")
const {MongoClient} = require("mongodb")

const app = express();
const PORT = 3000;

const URL = "mongodb+srv://jeelion22:Jeeva@1324@cluster0.2h2gvvu.mongodb.net/"

app.use(express.json())


app.post("/mentors/create", [body("mentorName").notEmpty().isString().trim().escape(),
body("mentorEmail").trim().isEmail().escape()], async (req, res)=>{
    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()){
            return res.status(400).json({errors: errors.array()})
        } 

        const data = req.body

        const connection = await  new MongoClient.connect(URL)
        const db = connection.db("Roadmap-Day39-Task");
        const collection = db.collection("mentors");
        const mentors = await collection.insertone(data);
        await connection.close()

        res.status(201).json({message: "mentor created successfully!"})

    } 
    catch(err){
        console.log(err)
        res.status(500).json({message: "Something went wrong"})
    }
})




app.listen(PORT, ()=>{
    console.log(`server connected successfully and listens at port ${PORT}`)
})


