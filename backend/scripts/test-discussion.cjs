const http = require('http');

async function login(email, password) {
  const body = JSON.stringify({ email, password, returnSecureToken: true });
  const r = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyCfnTPb50ixe_SRMzzeV8dCAQEdBRNmpXk',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body },
  );
  const j = await r.json();
  return j.idToken;
}

async function listDiscussions(courseId, token) {
  const r = await fetch(
    'http://localhost:3141/api/course/' + courseId + '/discussions',
    { headers: { Authorization: 'Bearer ' + token } },
  );
  return { status: r.status, body: await r.text() };
}

const COURSE_ID = '6a83db8d53981cc1c5e85e0f'; // from seed (latest run)

(async () => {
  const t = await login('teacher.discussion@demo.test', 'DemoTeacherPass123!');
  console.log('--- Teacher view ---');
  let r = await listDiscussions(COURSE_ID, t);
  console.log('status:', r.status);
  console.log('body:', r.body.substring(0, 500));

  const sa = await login('studenta.discussion@demo.test', 'DemoStudentPass123!');
  console.log('--- Student A view ---');
  r = await listDiscussions(COURSE_ID, sa);
  console.log('status:', r.status);
  console.log('body:', r.body.substring(0, 500));

  const sb = await login('studentb.discussion@demo.test', 'DemoStudentPass123!');
  console.log('--- Student B view (different cohort) ---');
  r = await listDiscussions(COURSE_ID, sb);
  console.log('status:', r.status);
  console.log('body:', r.body.substring(0, 500));
})();
