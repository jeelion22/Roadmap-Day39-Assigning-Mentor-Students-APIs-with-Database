const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { body, validationResult, param } = require("express-validator");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 5000;

const URL = process.env.DB_URL;

app.use(cors({ origin: "localhost:4000" }));
app.use(express.json());

// generate unique id for student
let studentIdPrefix = "fsd";

app.post(
  "/mentors/create",
  [
    body("mentorName").notEmpty().isString().trim().escape(),
    body("mentorEmail").trim().isEmail().escape(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const data = req.body;

      const connection = await MongoClient.connect(URL);
      const db = connection.db("Roadmap-Day39-Task");
      const collection = db.collection("mentors");

      const mentor = await collection.findOne({
        mentorEmail: req.body.mentorEmail,
      });

      if (mentor) {
        await connection.close();
        return res.status(409).json({ message: "mentor already registered" });
      }

      data.mentorId = uuidv4();

      data.studentsAssigned = [];

      await collection.insertOne(data);
      await connection.close();

      res.status(201).json({ message: "mentor created successfully!" });
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: "Something went wrong" });
    }
  }
);

app.get("/mentors", async (req, res) => {
  try {
    const connection = await MongoClient.connect(URL);
    const db = connection.db("Roadmap-Day39-Task");
    const collection = db.collection("mentors");

    const mentors = await collection.find({}).toArray();
    res.json(mentors);
    await connection.close();
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Somthing went wrong" });
  }
});

app.post(
  "/students/create",
  [
    body("studentName").notEmpty().isString().trim().escape(),
    body("studentEmail").notEmpty().isEmail().trim().escape(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }

      const connection = await MongoClient.connect(URL);
      const db = connection.db("Roadmap-Day39-Task");
      const collection = db.collection("students");

      const student = await collection.findOne({
        studentEmail: req.body.studentEmail,
      });

      if (student) {
        await connection.close();
        return res.status(409).json({ message: "student already registered" });
      }

      const studentData = req.body;

      studentData.studentId = uuidv4();

      studentData.mentorAssigned = [];
      studentData.isMentorAssigned = false;

      await collection.insertOne(studentData);

      await connection.close();

      res.status(201).json({ message: "Student created successfully!" });
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: "Somthing went wrong" });
    }
  }
);

// get students lists

app.get("/students", async (req, res) => {
  try {
    const connection = await MongoClient.connect(URL);
    const db = connection.db("Roadmap-Day39-Task");
    const collection = db.collection("students");

    const students = await collection.find({}).toArray();

    res.json({ students: students });

    await connection.close();
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "something went wrong" });
  }
});

// asign a mentor to a student
app.put(
  "/students/:studentId/mentors/:mentorId/assign",
  [
    param("studentId").notEmpty().escape(),
    param("mentorId").notEmpty().escape(),
  ],

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { studentId, mentorId } = req.params;

    try {
      const connection = await MongoClient.connect(URL);
      const db = connection.db("Roadmap-Day39-Task");
      const studentCollection = db.collection("students");
      const mentorCollection = db.collection("mentors");

      const student = await studentCollection.findOne({ studentId: studentId });

      const mentor = await mentorCollection.findOne({
        mentorId: mentorId,
      });

      if (!student) {
        return res.status(422).json({ message: "student not found" });
      }

      if (!mentor) {
        return res.status(422).json({ message: "mentor not found" });
      }

      let prevMentorId;

      if (student.currentMentorId) {
        prevMentorId = student.currentMentorId;
      }

      if (student.currentMentorId === mentorId) {
        return res.status(409).json({
          message:
            "This student has been already assigned with the same mentor",
        });
      }

      await mentorCollection.updateOne(
        { mentorId: mentorId },
        {
          $addToSet: {
            studentsAssigned: {
              studentId: studentId,
              studentName: student.studentName,
              isCurrentStudent: true /*current student */,
            },
          },
        }
      );

      // if mentor assigned already

      if (student.isMentorAssigned) {
        // const prevMentorId = await studentCollection.findOne(
        //   { studentId: studentId },
        //   { currentMentorId: 1 }
        // );

        // console.log(prevMentorId);

        await studentCollection.updateOne(
          { studentId: studentId },
          {
            $set: { "mentorAssigned.$[elem].isCurrentMentor": false },
          },
          { arrayFilters: [{ "elem.isCurrentMentor": true }] }
        );

        await mentorCollection.updateOne(
          { mentorId: prevMentorId },
          { $set: { "studentsAssigned.$[elem].isCurrentStudent": false } },
          {
            arrayFilters: [
              { "elem.isCurrentStudent": true, "elem.studentId": studentId },
            ],
          }
        );

        await studentCollection.updateOne(
          { studentId: studentId },
          {
            $set: { currentMentorId: mentorId, prevMentorId: prevMentorId },
            $addToSet: {
              mentorAssigned: {
                mentor_name: mentor.mentorName,
                mentor_id: mentorId,
                isCurrentMentor: true,
              },
            },
            $setOnInsert: { dateAdded: new Date() },
          }
        );
      } else {
        // if mentor is not assigned
        await studentCollection.updateOne(
          { studentId: studentId },
          {
            $set: { isMentorAssigned: true, currentMentorId: mentorId },
            $addToSet: {
              mentorAssigned: {
                mentor_name: mentor.mentorName,
                mentor_id: mentorId,
                isCurrentMentor: true,
              },
            },
            $setOnInsert: { dateAdded: new Date() },
          }
        );
      }
      res.json({ message: "Assigned mentor successfully!" });

      await connection.close();
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: "Something went wrong" });
    }
  }
);

app.put(
  "/mentor/students/assign",
  [
    body("mentorId").notEmpty().isString().trim().escape(),
    body("studentsIds").notEmpty().isArray(),
  ],
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const mentorId = req.body.mentorId;
    const studentsIds = req.body.studentsIds;

    let connection;

    try {
      connection = await MongoClient.connect(URL);
      const db = connection.db("Roadmap-Day39-Task");
      const mentorsCollection = db.collection("mentors");
      const studentsCollection = db.collection("students");

      const mentor = await mentorsCollection.findOne({ mentorId: mentorId });

      if (!mentor) {
        return res.status(422).json({ message: "mentor not found" });
      }

      const validStudentIds = await studentsCollection
        .find(
          { studentId: { $in: studentsIds }, isMentorAssigned: false },
          { projection: { studentId: 1, studentName: 1, _id: 0 } }
        )
        .toArray();

      if (studentsIds.length != validStudentIds.length) {
        // const notAssignedIds = studentsIds.filter(
        //   (id) => !validStudentIds.includes(id)
        // );

        return res.status(409).json({
          message: "students Ids may not found or mentors assigned already!",
        });
      }

      await mentorsCollection.updateOne(
        { mentorId: mentorId },
        {
          $addToSet: {
            studentsAssigned: {
              $each: validStudentIds.map((validStudentId) => ({
                ...validStudentId,
                isCurrentStudent: true,
              })),
            },
          },
        }
      );

      await studentsCollection.updateMany(
        {
          studentId: { $in: studentsIds },
          isMentorAssigned: false,
        },
        {
          $set: { isMentorAssigned: true, currentMentorId: mentorId },
          $addToSet: {
            mentorAssigned: {
              mentor_name: mentor.mentorName,
              mentor_id: mentorId,
              isCurrentMentor: true,
            },
          },
        }
      );

      res
        .status(201)
        .json({ message: "students assigned to the mentor successfully!" });
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: "something went wrong" });
    }
  }
);

app.listen(PORT, () => {
  console.log(`server connected successfully and listens at port ${PORT}`);
});
