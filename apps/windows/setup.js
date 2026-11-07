window.foonSetup.current().then(current=>{
  if(current){document.querySelector('#cloud').value=current.cloudUrl;document.querySelector('#device').textContent='الجهاز المحدد / Current device: '+current.deviceId;}
});
document.querySelector('#enroll').addEventListener('click',async()=>{
  const result=await window.foonSetup.enroll(document.querySelector('#cloud').value);
  document.querySelector('#device').textContent=result.ok?'تم اختيار الجهاز / Device selected: '+result.deviceId:'لم يتم تغيير الجهاز. تحقق من الرابط وملف التفعيل / Device unchanged. Check endpoint and file.';
});
document.querySelector('#setup').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector('button[type="submit"]');
  button.disabled = true;
  document.querySelector('#status').textContent = 'جارٍ التحقق والتشغيل… / Checking local service…';
  try {
    const result = await window.foonSetup.save({databaseUrl: document.querySelector('#database').value});
    if (!result.ok) throw Error();
  } catch {
    document.querySelector('#status').textContent = 'تعذر الاتصال. تحقق من قاعدة البيانات المحلية وكلمة المرور والترحيلات. / Check the local database, password and migrations.';
    button.disabled = false;
  }
});
