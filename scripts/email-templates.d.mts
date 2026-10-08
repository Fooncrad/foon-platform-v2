export type EmailTemplate={template_key:string;label?:string;subject_template:string;body_template:string};
export const emailTemplateKeys:string[];
export const templateVariables:string[];
export const defaultEmailTemplates:EmailTemplate[];
export function validateEmailTemplate(template:EmailTemplate):boolean;
export function renderEmailTemplate(template:EmailTemplate,variables:Record<string,string>):{subject:string;text:string;html:string};
export function renderQueuedEmail(job:{event_key:string;subject:string;body_text:string;tenant_name?:string},templates?:EmailTemplate[]):{subject:string;text:string;html:string};
