// Import modules
const express = require('express');
const multer = require('multer');
const Sequelize = require('sequelize');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');
const { execSync: exec } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');


// Create an express app
const app = express();

// Configure multer to store files in a folder named 'videos'
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname))
  }
})

var upload = multer({ storage: storage });

// Define a model for videos using sequelize
const env = process.env.NODE_ENV;
const sequelize = new Sequelize(
   process.env.DB,
   process.env.USER,
   process.env.PASSWORD,
  {
    host:  process.env.HOST,
    dialect:  "postgres"
  });
const Video = sequelize.define('video', {
  name: Sequelize.STRING,
  path: Sequelize.STRING,
});

// Sync the model with the database
Video.sync();

// Create a route to handle file uploading
app.post('/upload', upload.single('video'), (req, res) => {
  // Get the file from the request
  const file = req.file;

  // Create a new video record in the database with the file name and path
  Video.create({
    name: file.originalname,
    path: file.path,
  })
    .then((video) => {
      // Send a success response with the video id
      res.redirect('/videos/' + video.id);
    })
    .catch((err) => {
      // Handle any error
      console.error(err);
      res.status(500).json({ success: false, error: err.message });
    });
});
//create a route for transcript
app.get('/transcript/:id', (req,res) =>{
    const id = req.params.id;

    // Find the video record in the database by id
    Video.findByPk(id)
      .then((video) => {
        // Check if the video exists
        if (video) {
          // Get the file path from the video record
          const filePath = video.path;
          ffmpeg(`-hide_banner -y -i ${filePath} ${filePath}.mp3`);
          const audioFile = path.join(__dirname, `${filePath}.mp3`);
          const model = 'whisper-1';

          const formData = new FormData();
          formData.append("model", model);
          formData.append("file", fs.createReadStream(audioFile))

          axios
            .post('https://api.openai.com/v1/audio/transcriptions', formData, {
              headers:{
                Authorization: `Bearer ${process.env.OPENAL_KEY}`,
                'Content-Type' : `multipart/form-data; boundary = ${formData._boundary} `,

              }
            })
            .then((transcript) =>{
              var transcription = transcript.data;
              res.send(transcription)
            })
            .catch((err) => {
              // Handle any error
              console.error(err);
              res.status(500).json({ success: false, error: err.message });
            });
          
  
          async function ffmpeg(command) {
                try {
                    return new Promise((resolve, reject) => {
                        exec(`${ffmpegStatic} ${command}`, (err, stderr, stdout) => {
                            if (err) reject(err);
                            resolve(stdout);
                        });
                    });
                } catch (error) {
                    console.error (error); // print the error if the promise is rejected
                }
            }
        } else {
          // If the video does not exist, send a not found response
          res.status(404).json({ success: false, error: 'Record does not exist' });
        }
      })
      .catch((err) => {
        // Handle any error
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
      });
})
// Create a route to serve video files
app.get('/videos/:id', (req, res) => {
  // Get the video id from the request parameters
  const id = req.params.id;

  // Find the video record in the database by id
  Video.findByPk(id)
    .then((video) => {
      // Check if the video exists
      if (video) {
        // Get the file path from the video record
        const filePath = video.path;

        // Set the content type header
        res.set('Content-Type', 'video/mp4');

        // Create a read stream from the file and pipe it to the response
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        
      } else {
        // If the video does not exist, send a not found response
        res.status(404).json({ success: false, error: 'Record does not exist' });
      }
    })
    .catch((err) => {
      // Handle any error
      console.error(err);
      res.status(500).json({ success: false, error: err.message });
    });
});


app.listen(process.env.PORT, () => {
  console.log('Server running');
});