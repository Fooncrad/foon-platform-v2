document.querySelector('#setup').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector('button');
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
