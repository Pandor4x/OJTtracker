const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Match DB config in server.js
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ojt_tracker',
  password: 'yourpassword',
  port: 5432
});

async function run(){
  try{
    // Create some demo users
    const users = [
      {last_name:'Admin', first_name:'Site', student_id:'AD-00001', email:'admin@example.com', password:'admin123', role:'admin', course:'', address:'Office', age:30},
      {last_name:'Doe', first_name:'John', student_id:'AB-10001', email:'john.doe@example.com', password:'password', role:'student', course:'Bachelor Of Science In Computer Science', address:'123 Main St', age:20},
      {last_name:'Smith', first_name:'Jane', student_id:'CD-20002', email:'jane.smith@example.com', password:'password', role:'student', course:'Bachelor Of Science In Nursing', address:'45 Oak Ave', age:22},
      {last_name:'Brown', first_name:'Alice', student_id:'EF-30003', email:'alice.brown@example.com', password:'password', role:'student', course:'Bachelor Of Science In Business Administration - Major In Marketing Management', address:'78 Pine Rd', age:21},
      {last_name:'Lee', first_name:'Bob', student_id:'GH-40004', email:'bob.lee@example.com', password:'password', role:'student', course:'Bachelor Of Science In Criminology', address:'9 Elm St', age:23}
    ];

    const created = [];

    for(const u of users){
      const hashed = await bcrypt.hash(u.password,10);
      const res = await pool.query(
        `INSERT INTO users (last_name,first_name,student_id,course,address,age,email,password,role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email
         RETURNING id`,
         [u.last_name,u.first_name,u.student_id,u.course,u.address,u.age,u.email,hashed,u.role]
      );
      created.push({id: res.rows[0].id, student_id: u.student_id, email: u.email, role: u.role});
    }

    // Insert some time logs for students
    const logs = [
      {student_email:'john.doe@example.com',date:'2026-02-18',start:'08:00',end:'12:00',hours:4},
      {student_email:'john.doe@example.com',date:'2026-02-19',start:'09:00',end:'15:00',hours:6},
      {student_email:'jane.smith@example.com',date:'2026-02-20',start:'08:30',end:'12:30',hours:4},
      {student_email:'alice.brown@example.com',date:'2026-02-21',start:'10:00',end:'16:00',hours:6},
      {student_email:'bob.lee@example.com',date:'2026-02-22',start:'07:00',end:'11:00',hours:4}
    ];

    for(const l of logs){
      const ures = await pool.query('SELECT id FROM users WHERE email=$1',[l.student_email]);
      if(ures.rows.length===0) continue;
      const sid = ures.rows[0].id;
      await pool.query(
        `INSERT INTO time_logs (student_id,date,start_time,end_time,total_hours,status)
         VALUES ($1,$2,$3,$4,$5,'approved')`,
         [sid,l.date,l.start,l.end,l.hours]
      );
    }

    console.log('Seed complete. Created users:', created);
  }catch(err){
    console.error('Seed error', err);
  }finally{
    await pool.end();
    process.exit();
  }
}

run();
