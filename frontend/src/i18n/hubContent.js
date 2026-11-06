const fields=new Set(['title','summary','body','paragraphs','learningObjectives','keyPoints','topics','steps','sections','items','prompts','instructions','introduction','statement','label','text']);
export function instructionTexts(value){
 const result=new Set();
 function visit(item,allowed=false){
  if(typeof item==='string'){if(allowed&&item.trim())result.add(item);return;}
  if(Array.isArray(item)){item.forEach(child=>visit(child,allowed));return;}
  if(item&&typeof item==='object')for(const [key,child] of Object.entries(item))visit(child,fields.has(key));
 }
 visit(value);return [...result];
}
export function scopedContentText(locale,source,map,fallback=value=>value){
 if(locale==='es'&&typeof source==='string'&&map&&Object.hasOwn(map,source)&&typeof map[source]==='string')return map[source];
 return fallback(source);
}
export function questionStemText(locale,question,fallback){
 const value=question.displayTranslation?.es?.question;
 return locale==='es'&&typeof value==='string'?value:fallback(question.question);
}
export function questionChoiceText(locale,question,choice,fallback){
 const choices=question.displayTranslation?.es?.choices;
 return locale==='es'&&choices&&Object.hasOwn(choices,choice?.id)&&typeof choices[choice.id]==='string'?choices[choice.id]:fallback(choice?.label);
}
