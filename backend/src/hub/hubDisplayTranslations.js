import spanish from './hubDisplaySpanish.json' with {type:'json'};
import questions from './hubQuestionDisplaySpanish.json' with {type:'json'};

// Display companions only. Never translate IDs, answers, policies or stored rows.
const readable=new Set(['title','description','summary','body','paragraphs','learningObjectives','keyPoints','topics','steps','sections','items','prompts','instructions','introduction','statement','label','text','question','blockedReason','courseTitle','evaluationTitle','moduleTitle','activityTitle']);
export function hubDisplayTranslations(payload,{includeQuestions=false}={}){
  const found=Object.create(null);
  function visit(value,allowed=false){
    if(typeof value==='string'){
      if(allowed&&Object.hasOwn(spanish,value))found[value]=spanish[value];
      else if(allowed&&includeQuestions&&Object.hasOwn(questions,value))found[value]=questions[value];
      return;
    }
    if(Array.isArray(value)){for(const item of value)visit(item,allowed);return;}
    if(value&&typeof value==='object')for(const [key,item] of Object.entries(value))if(key!=='displayTranslations')visit(item,readable.has(key));
  }
  visit(payload);return found;
}
export function hubDisplayTranslationMiddleware(req,res,next){
  const json=res.json.bind(res);
  res.json=payload=>{
    if(res.statusCode<400&&payload&&typeof payload==='object'&&!Array.isArray(payload)){
      const includeQuestions=/^\/scored-evaluations\/attempts\/[^/]+\/runtime(?:\/[^/]+)?$/.test(req.path||'')||/^\/assessment\/attempts\/[^/]+\/evidence$/.test(req.path||'')||req.path==='/assessment/questions';
      const es=hubDisplayTranslations(payload,{includeQuestions});
      if(Object.keys(es).length)return json({...payload,displayTranslations:{revision:'2026-11-04.1',es}});
    }
    return json(payload);
  };
  next();
}
