import { Router } from 'express';
import { generateItinerary, getTravelData, recommendDestinations } from '../services/planner.js';
import { aStar, bfs, buildRouteGraph } from '../lib/search.js';

const router = Router();
const sessions = new Map();
const data = getTravelData();
const validPrefs = body => {
  const prefs = {...(body.preferences || body.prefs || body)};
  if (prefs.budget !== undefined && (!Number.isFinite(Number(prefs.budget)) || Number(prefs.budget) < 0)) throw Object.assign(new Error('Budget must be a non-negative number.'), {status:400});
  if (prefs.days !== undefined && (!Number.isInteger(Number(prefs.days)) || Number(prefs.days)<1 || Number(prefs.days)>21)) throw Object.assign(new Error('Trip duration must be between 1 and 21 days.'), {status:400});
  if (prefs.travellers !== undefined && (!Number.isInteger(Number(prefs.travellers)) || Number(prefs.travellers)<1 || Number(prefs.travellers)>20)) throw Object.assign(new Error('Travellers must be between 1 and 20.'), {status:400});
  return prefs;
};

router.get('/health', (_req,res)=>res.json({status:'ok',service:'TravelMate API'}));
router.get('/destinations', (_req,res)=>res.json({destinations:data.destinations.map(({activities,...d})=>({...d,activityCount:activities.length})), note:'Curated sample dataset; costs are illustrative.'}));
router.get('/destinations/:id', (req,res)=>{ const d=data.destinations.find(x=>x.id===req.params.id); if(!d) return res.status(404).json({error:'Destination not found.'}); res.json(d); });
router.post('/recommendations',(req,res,next)=>{try {const prefs=validPrefs(req.body); const history=req.body.history || []; res.json(recommendDestinations(prefs,history));} catch(e){next(e);}});
router.post('/itineraries/generate',(req,res,next)=>{try {const prefs=validPrefs(req.body); if(!req.body.destinationId) throw Object.assign(new Error('destinationId is required.'),{status:400}); const plan=generateItinerary(req.body.destinationId,prefs,req.body.history||[]); sessions.set(plan.id,plan); res.json(plan);}catch(e){next(e);}});
router.post('/itineraries/alternatives',(req,res,next)=>{try {const prefs=validPrefs(req.body); const history=req.body.history||[]; const previousIds=history.map(h=>h.destinationId).filter(Boolean); const result=recommendDestinations({...prefs,excludeDestinationIds:[...(prefs.excludeDestinationIds||[]),...(req.body.excludeDestinationIds||[])]},history); res.json({...result, recommendations:result.recommendations.filter(d=>!previousIds.includes(d.id))});}catch(e){next(e);}});
router.post('/itineraries/modify',(req,res,next)=>{try {const prefs=validPrefs(req.body); const plan=generateItinerary(req.body.destinationId,prefs,req.body.history||[]); sessions.set(plan.id,plan); res.json(plan);}catch(e){next(e);}});
router.get('/itineraries/:id',(req,res)=>{const plan=sessions.get(req.params.id); if(!plan) return res.status(404).json({error:'Plan not found in this server session. Generate it again to continue.'}); res.json(plan);});
router.post('/chat',(req,res,next)=>{try {
  const message=String(req.body.message||'').trim(); if(!message) throw Object.assign(new Error('Please enter a message.'),{status:400});
  const sessionId=String(req.body.sessionId||'default'); const old=sessions.get(`chat-${sessionId}`)||{preferences:{origin:'Hyderabad',destinationRange:'Anywhere',budget:30000,travellers:1,days:4,travelStyle:'moderate',interests:[]},history:[]};
  const p={...old.preferences}; const lower=message.toLowerCase();
  const budgetMatch=message.match(/(?:₹|rs\.?\s?|inr\s?)([\d,]+)/i)||message.match(/budget\s*(?:to|of|is|:)?\s*([\d,]+)/i); if(budgetMatch) p.budget=Number(budgetMatch[1].replace(/,/g,''));
  const daysMatch=lower.match(/(\d+)\s*[- ]?day/); if(daysMatch) p.days=Number(daysMatch[1]);
  const peopleMatch=lower.match(/(\d+)\s*(?:travellers?|travelers?|people|persons?|adults?)/); if(peopleMatch) p.travellers=Number(peopleMatch[1]);
  const rangeMatch=data.destinations.find(d=>lower.includes(d.name.toLowerCase())||lower.includes(d.country.toLowerCase())||lower.includes(d.continent.toLowerCase())); if(rangeMatch) p.destinationRange=lower.includes(rangeMatch.country.toLowerCase())?rangeMatch.country:lower.includes(rangeMatch.continent.toLowerCase())?rangeMatch.continent:rangeMatch.name;
  const interestTerms=['beaches','mountains','history','culture','food','wildlife','shopping','nightlife','nature','photography','religious sites','relaxation']; const found=interestTerms.filter(i=>lower.includes(i)); if(found.length) p.interests=found;
  const styleTerms=['budget','moderate','comfort','luxury','adventure','cultural','nature','relaxation','family','solo']; const style=styleTerms.find(s=>lower.includes(s)); if(style) p.travelStyle=style;
  old.preferences=p; sessions.set(`chat-${sessionId}`,old);
  let response='I updated your trip preferences. I can recommend destinations or build a day-by-day plan from them.';
  if(/why|explain|score|recommend/.test(lower)) response='I apply geographic and budget constraints first, then rank feasible destinations using interest match (30%), budget suitability (25%), travel style (20%), duration (15%) and practicality (10%). The scores are explainable rules, not a trained ML model.';
  else if(/another|different|alternative/.test(lower)) response='I will look for a different feasible destination or activity combination, avoiding options already shown in this session where possible.';
  else if(/hotel|accommodation/.test(lower)) response='Accommodation estimates are based on the selected destination dataset. I can change the accommodation category, but these are not live hotel availability results.';
  res.json({reply:response,preferences:p,parsed:{budget:budgetMatch? p.budget:null,days:daysMatch?p.days:null,travellers:peopleMatch?p.travellers:null,destinationRange:rangeMatch?p.destinationRange:null,interests:found}});
}catch(e){next(e);}});
router.post('/search/route',(req,res,next)=>{try{const {start='Hyderabad',goal,algorithm='astar'}=req.body;if(!goal) throw Object.assign(new Error('goal is required.'),{status:400});const graph=buildRouteGraph(data.routes);if(algorithm==='bfs'){const simple=Object.fromEntries(Object.entries(graph).map(([k,edges])=>[k,edges.map(e=>e.to)]));return res.json({algorithm:'BFS',path:bfs(simple,start,goal),note:'BFS returns a route with the fewest edges in this unweighted sample graph.'});}const result=aStar(graph,start,goal,()=>0);res.json({algorithm:'A*',...result,note:'Distance-based sample graph with zero heuristic; illustrative only, not live navigation.'});}catch(e){next(e);}});

export default router;
