const form = document.getElementById('loginForm');
const error = document.getElementById('loginError');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.hidden = true;
  const button = form.querySelector('button');
  button.disabled = true;
  button.textContent = 'جارٍ تسجيل الدخول...';
  try {
    const body = Object.fromEntries(new FormData(form).entries());
    const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر تسجيل الدخول');
    location.href = '/';
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'دخول إلى لوحة الدراسة';
  }
});
