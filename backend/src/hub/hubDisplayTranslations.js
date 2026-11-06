import spanish from './hubDisplaySpanish.json' with {type:'json'};
import questions from './hubQuestionDisplaySpanish.json' with {type:'json'};

// Display companions only. Never translate IDs, answers, policies or stored rows.
const readable=new Set(['title','description','summary','body','paragraphs','learningObjectives','keyPoints','topics','steps','sections','items','prompts','instructions','introduction','statement','label','text','question','blockedReason','courseTitle','evaluationTitle','moduleTitle','activityTitle']);
export function hubDisplayTranslations(payload,{includeQuestions=false}={}){
  const found=Object.create(null);
  function visit(value,allowed=false){
    if(typeof value==='string'){
      if(allowed&&Object.hasOwn(spanish,value))found[value]=spanish[value];
      return;
    }
    if(Array.isArray(value)){for(const item of value)visit(item,allowed);return;}
    if(value&&typeof value==='object')for(const [key,item] of Object.entries(value))if(key!=='displayTranslations')visit(item,readable.has(key));
  }
  visit(payload);
  if(includeQuestions){
    const nodes=[...(Array.isArray(payload?.questions)?payload.questions:[]),...(payload?.question&&typeof payload.question==='object'?[payload.question]:[])];
    for(const question of nodes){
      if(typeof question.question==='string'&&Object.hasOwn(questions,question.question))found[question.question]=questions[question.question];
      for(const choice of Array.isArray(question.choices)?question.choices:[])if(typeof choice.label==='string'&&Object.hasOwn(questions,choice.label))found[choice.label]=questions[choice.label];
    }
  }
  return found;
}
export function createHubDisplayTranslationMiddleware({service}={}){return function(req,res,next){
  const json=res.json.bind(res);
  res.json=payload=>{
    if(res.statusCode<400&&payload&&typeof payload==='object'&&!Array.isArray(payload)){
      const path=req.path||'';
      const includeQuestions=/^\/scored-evaluations\/attempts\/[^/]+\/runtime(?:\/[^/]+)?$/.test(path)||/^\/assessment\/attempts\/[^/]+\/evidence$/.test(path)||path==='/assessment/questions';
      const send=(value,extra={})=>{const es={...hubDisplayTranslations(value,{includeQuestions}),...extra};return json(Object.keys(es).length?{...value,displayTranslations:{revision:'2026-11-04.1',es}}:value);};
      if(service&&(path==='/learning-path'||includeQuestions)){
        // Display enrichment cannot report a committed action as a failed mutation.
        Promise.resolve().then(()=>service.enrich(req.hubIdentity,path,payload)).then(result=>send({...result.payload,displayTranslationStatus:'ready'},result.es),()=>send({...payload,displayTranslationStatus:'unavailable'}));
        return res;
      }
      return send(payload);
    }
    return json(payload);
  };
  next();
};}
export const hubDisplayTranslationMiddleware=createHubDisplayTranslationMiddleware();
