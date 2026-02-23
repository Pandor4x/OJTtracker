const token = localStorage.getItem("token");

// API base: use explicit localhost URL during local dev, otherwise same-origin
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:3000' : '';

function apiFetch(path, opts){
    return fetch(API_BASE + path, opts);
}

function logout(){
    localStorage.removeItem("token");
    window.location="login.html";
}

// ================= STUDENT =================
async function logTime(){
    const start=document.getElementById("start").value;
    const end=document.getElementById("end").value;

    await apiFetch("/time-log",{
        method:"POST",
        headers:{
            "Content-Type":"application/json",
            "Authorization":token
        },
        body:JSON.stringify({start_time:start,end_time:end})
    });

    loadStudent();
}

async function loadStudent(){
    const res=await apiFetch("/student/me",{headers:{"Authorization":token}});
    const data=await res.json();

    document.getElementById("totalHours").innerText=data.total;

    const percent=(data.total/500)*100;
    document.getElementById("progressBar").style.width=percent+"%";

    // Chart
    const ctx=document.getElementById("weeklyChart");
    new Chart(ctx,{
        type:"bar",
        data:{
            labels:data.weekLabels,
            datasets:[{
                label:"Hours",
                data:data.weekHours
            }]
        }
    });

    // Records table (if provided by API)
    const recordsTable = document.getElementById("recordsTable");
    if(recordsTable){
        recordsTable.innerHTML = "";
        if(Array.isArray(data.logs)){
            data.logs.forEach(log=>{
                recordsTable.innerHTML += `
                <tr>
                    <td>${log.date}</td>
                    <td>${log.start_time}</td>
                    <td>${log.end_time}</td>
                    <td>${log.total_hours}</td>
                    <td>${log.status}</td>
                    <td>
                        <button class="btn btn-sm btn-warning" onclick="editLog(${log.id}, '${log.start_time}', '${log.end_time}')">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteLog(${log.id})">Delete</button>
                    </td>
                </tr>`;
            });
        }
    }
}

// Edit a time log (student)
async function editLog(id, oldStart, oldEnd){
    const newStart = prompt("Edit Start Time:", oldStart);
    const newEnd = prompt("Edit End Time:", oldEnd);
    if(!newStart || !newEnd) return;

    await apiFetch(`/time-log/${id}`,{
        method:"PUT",
        headers:{
            "Content-Type":"application/json",
            "Authorization":token
        },
        body:JSON.stringify({start_time:newStart,end_time:newEnd})
    });

    loadStudent();
}

// Delete a time log (student)
async function deleteLog(id){
    if(!confirm("Delete this record?")) return;
    await apiFetch(`/time-log/${id}`,{
        method:"DELETE",
        headers:{"Authorization":token}
    });
    loadStudent();
}

// Export student's records to PDF
function exportPDF(){
    window.open(API_BASE + "/export","_blank");
}

// ================= ADMIN =================
async function loadAdmin(){
    const filterEl = document.getElementById('courseFilter');
    const course = filterEl ? filterEl.value : '';
    const url = course ? `/admin/students?course=${encodeURIComponent(course)}` : '/admin/students';
    const res=await apiFetch(url,{headers:{"Authorization":token}});
    const students=await res.json();

    const table=document.getElementById("studentTable");
    table.innerHTML="";

    students.forEach(s=>{
        table.innerHTML+=`
        <tr>
        <td>${s.full_name}</td>
        <td>${s.course || ''}</td>
        <td>${s.student_id || ''}</td>
        <td>${s.total_hours}</td>
        <td>${s.total_hours>=500?"Completed":"Ongoing"}</td>
        </tr>`;
    });

    // wire filter change
    if(filterEl) filterEl.onchange = ()=> loadAdmin();
}

// ================= SUPERVISOR =================
async function loadPending(){
    const res=await apiFetch("/supervisor/pending",{headers:{"Authorization":token}});
    const logs=await res.json();

    const table=document.getElementById("pendingTable");
    table.innerHTML="";

    logs.forEach(l=>{
        table.innerHTML+=`
        <tr>
        <td>${l.student}</td>
        <td>${l.date}</td>
        <td>${l.total_hours}</td>
        <td>
        <button onclick="approve(${l.id})" class="btn btn-success btn-sm">
        Approve
        </button>
        </td>
        </tr>`;
    });
}

async function approve(id){
    await apiFetch("/approve/"+id,{
        method:"PUT",
        headers:{"Authorization":token}
    });
    loadPending();
}

// ================= RESET =================
async function resetPassword(){
    const email=document.getElementById("resetEmail").value;

    await apiFetch("/reset-request",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({email})
    });

    alert("Reset link sent to email.");
}

// Auto-load
if(location.pathname.includes("student")) loadStudent();
if(location.pathname.includes("admin")) loadAdmin();
if(location.pathname.includes("supervisor")) loadPending();

// Sidebar toggle (hamburger) - opens #sidebar and toggles #overlay
function openSidebar(){
    const sb=document.getElementById('sidebar');
    const ov=document.getElementById('overlay');
    if(sb){ sb.classList.add('open'); }
    if(ov){ ov.classList.add('show'); }
}
function closeSidebar(){
    const sb=document.getElementById('sidebar');
    const ov=document.getElementById('overlay');
    if(sb){ sb.classList.remove('open'); }
    if(ov){ ov.classList.remove('show'); }
}
function toggleSidebar(){
    const sb=document.getElementById('sidebar');
    if(sb && sb.classList.contains('open')) closeSidebar(); else openSidebar();
}

// Attach sidebar handlers immediately so script works whether loaded before/after DOMContentLoaded
const _hb = document.getElementById('hamburger');
const _ov = document.getElementById('overlay');
if(_hb) _hb.addEventListener('click', (e)=>{ e.stopPropagation(); toggleSidebar(); });
if(_ov) _ov.addEventListener('click', ()=>closeSidebar());
// close when pressing ESC
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeSidebar(); });