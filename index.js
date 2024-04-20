const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { body, validationResult, param } = require("express-validator");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 5000;

const URL = process.env.DB_URL;

app.use(cors({ origin: "localhost:4000" }));
app.use(express.json());

// creates mentor
app.post(
  "/mentors/create",
  // validates request body
  [
    body("mentorName").notEmpty().isString().escape().trim(),
    body("mentorEmail").notEmpty().isEmail().escape().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const data = req.body;

    let connection;

    try {
      connection = await MongoClient.connect(URL);
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

      res.status(201).json({ message: "mentor created successfully!" });
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: "Something went wrong" });
    } finally {
      await connection.close();
    }
  }
);

// get all mentors
app.get("/mentors", async (req, res) => {
  let connection;
  try {
    connection = await MongoClient.connect(URL);
    const db = connection.db("Roadmap-Day39-Task");
    const collection = db.collection("mentors");

    const mentors = await collection.find({}).toArray();
    res.json(mentors);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Somthing went wrong" });
  } finally {
    await connection.close();
  }
});

// creates students
app.post(
  "/students/create",
  [
    body("studentName").notEmpty().isString().trim().escape(),
    body("studentEmail").notEmpty().isEmail().trim().escape(),
  ],
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    let connection;

    try {
      connection = await MongoClient.connect(URL);
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

      res.status(201).json({ message: "Student created successfully!" });
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: "Somthing went wrong" });
    } finally {
      await connection.close();
    }
  }
);

// get all students

app.get("/students", async (req, res) => {
  let connection;
  try {
    connection = await MongoClient.connect(URL);
    const db = connection.db("Roadmap-Day39-Task");
    const collection = db.collection("students");

    const students = await collection.find({}).toArray();

    res.json({ students: students });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "something went wrong" });
  } finally {
    await connection.close();
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

    let connection;

    try {
      connection = await MongoClient.connect(URL);
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

      // if mentor assigned already

      if (student.isMentorAssigned) {
        // const prevMentorId = await studentCollection.findOne(
        //   { studentId: studentId },
        //   { currentMentorId: 1 }
        // );

        // console.log(prevMentorId);

        // updating current mentor to false in student document

        const isSameMentorBefore = student.mentorAssigned.filter(
          (mentor) => mentor.mentorId === mentorId
        );

        console.log(isSameMentorBefore);

        if (isSameMentorBefore.length > 0) {
          await mentorCollection.updateOne(
            { mentorId: mentorId },
            {
              $set: { "studentsAssigned.$[elem].isCurrentStudent": true },
            },
            {
              arrayFilters: [
                {
                  "elem.studentId": studentId,
                  "elem.isCurrentStudent": false,
                },
              ],
            }
          );

          // console.log("----------------------1");

          await studentCollection.updateOne(
            { studentId: studentId },
            {
              $set: { "mentorAssigned.$[elem].isCurrentMentor": true },
            },
            {
              arrayFilters: [
                {
                  "elem.isCurrentMentor": false,
                  "elem.mentorId": mentorId,
                },
              ],
            }
          );

          // console.log("----------------------2");

          await studentCollection.updateOne(
            { studentId: studentId },
            {
              $set: { "mentorAssigned.$[elem].isCurrentMentor": false },
            },
            {
              arrayFilters: [
                {
                  "elem.isCurrentMentor": true,
                  "elem.mentorId": prevMentorId,
                },
              ],
            }
          );

          // console.log("---------------------3");

          await studentCollection.updateOne(
            { studentId: studentId },
            {
              $set: { currentMentorId: mentorId, prevMentorId: prevMentorId },
              // $addToSet: {
              //   mentorAssigned: {
              //     mentorName: mentor.mentorName,
              //     mentorId: mentorId,
              //     isCurrentMentor: true,
              //   },
              // },
            }
          );

          await mentorCollection.updateOne(
            { mentorId: prevMentorId },
            { $set: { "studentsAssigned.$[elem].isCurrentStudent": false } },
            {
              arrayFilters: [
                { "elem.studentId": studentId, "elem.isCurrentStudent": true },
              ],
            }
          );

          // console.log("----------------------4");
        } else {
          await studentCollection.updateOne(
            { studentId: studentId },
            {
              $set: { "mentorAssigned.$[elem].isCurrentMentor": false },
            },
            { arrayFilters: [{ "elem.isCurrentMentor": true }] }
          );

          // updaing the previous mentor status to false
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
                  mentorName: mentor.mentorName,
                  mentorId: mentorId,
                  isCurrentMentor: true,
                },
              },
              $setOnInsert: { dateAdded: new Date() },
            }
          );

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
        }
      } else {
        // if mentor is not assigned

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

        await studentCollection.updateOne(
          { studentId: studentId },
          {
            $set: { isMentorAssigned: true, currentMentorId: mentorId },
            $addToSet: {
              mentorAssigned: {
                mentorName: mentor.mentorName,
                mentorId: mentorId,
                isCurrentMentor: true,
              },
            },
            $setOnInsert: { dateAdded: new Date() },
          }
        );
      }
      res.json({ message: "Assigned mentor successfully!" });
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: "Something went wrong" });
    } finally {
      await connection.close();
    }
  }
);

// assigns a list of students to a specific mentor
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
              mentorName: mentor.mentorName,
              mentorId: mentorId,
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

// lists all students of a specified mentor
app.get(
  "/mentors/:mentorId/allstudents",
  param("mentorId").notEmpty().isString().escape().trim(),
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    let connection;

    try {
      connection = await MongoClient.connect(URL);
      const db = connection.db("Roadmap-Day39-Task");
      const mentorCollection = db.collection("mentors");

      const { mentorId } = req.params;

      const mentor = await mentorCollection.findOne({ mentorId: mentorId });

      if (!mentor) {
        return res.status(409).json({ message: "Invalid mentor id" });
      }

      const students = mentor.studentsAssigned;

      res.json({ studentsAssigned: students });
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: "Something went wrong" });
    } finally {
      await connection.close();
    }
  }
);

// gets previous mentor of a student
app.get(
  "/students/previousmentor/:studentId",
  param("studentId").notEmpty().escape().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    const { studentId } = req.params;

    let connection;

    try {
      connection = await MongoClient.connect(URL);
      const db = connection.db("Roadmap-Day39-Task");
      const studentCollection = db.collection("students");

      const student = await studentCollection.findOne({ studentId: studentId });

      if (!student) {
        return res.status(409).json({ message: "Invalid student id" });
      }

      if (!student.prevMentorId) {
        return res.status(404).json({
          message: "No information found about previous mentor for the student",
        });
      }

      res.json({ previousMentor: student.prevMentorId });
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: "Something went wrong" });
    } finally {
      connection.close();
    }
  }
);

app.listen(PORT, () => {
  console.log(`server connected successfully and listens at port ${PORT}`);
});
