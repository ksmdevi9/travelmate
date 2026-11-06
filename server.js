import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import api from './routes/api.js';

const app=express();
const PORT=Number(process.env.PORT)||5000;
app.use(cors({origin:process.env.CLIENT_ORIGIN||true}));
app.use(express.json({limit:'1mb'}));
app.use('/api',api);
app.use((err,_req,res,_next)=>{const status=err.status||500;res.status(status).json({error:err.message||'Unexpected server error.',...(err.details?{details:err.details}:{})});});
app.use((_req,res)=>res.status(404).json({error:'Endpoint not found.'}));
app.listen(PORT,()=>console.log(`TravelMate API listening on http://localhost:${PORT}`));
