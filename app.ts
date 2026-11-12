import "dotenv/config";
import express from 'express';
import routes from "./routes/index";


const app = express();
app.use(express.json())
app.use(routes)

const PORT = process.env.PORT

app.get("/health", (req, res)=>{
    res.status(200).send("Server is ok.")
})

app.get("/", (req, res)=>{
    res.send("<h1>Welcome to the homepage</h1>")
})

app.listen(PORT, ()=>{
    console.log(`Server is running on port: ${PORT}`)
})
