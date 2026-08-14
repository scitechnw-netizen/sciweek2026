# ตามล่าหาสมบัติ — GitHub Pages + Supabase

เว็บเกมสำหรับนักเรียนแบบ Static Frontend บน GitHub Pages และใช้ Supabase เป็นฐานข้อมูล/Backend

## ฟังก์ชันหลัก

- ค้นหานักเรียนด้วย `student_code` แล้วแสดงชื่อก่อนเริ่มเกม
- 1 รหัสนักเรียนสร้างเกมได้เพียง 1 ครั้ง
- รีเฟรชหน้าเว็บแล้วเล่น session เดิมต่อได้จากอุปกรณ์เดิม
- สุ่มป้ายแบบไม่ซ้ำจาก 43 ป้าย
- แต่ละป้ายต้องมีข้อสอบ 3 ข้อ ระบบสุ่มมา 1 ข้อ
- หน้าเกมนักเรียนเห็นเฉพาะหมายเลขป้ายและตัวเลือก A-D ไม่ได้รับข้อความคำถามหรือเฉลยจาก API
- ตอบผิดลองใหม่ได้ และระบบเก็บจำนวนครั้งที่ตอบผิด
- ตอบถูกครบ 10 ข้อ: เปิดหีบที่ 1 และเลือกเล่นต่อ/จบเกม
- ตอบถูกครบ 20 ข้อ: เปิดหีบที่ 2 และเลือกเล่นต่อ/จบเกม
- ตอบถูกครบ 25 ข้อ: จบอัตโนมัติและได้รับรางวัลใหญ่
- เมื่อจบเกมแจ้งให้มารับรางวัลที่ห้อง 738
- Admin: นำเข้ารายชื่อนักเรียน CSV, แก้ข้อสอบ/ตัวเลือก/เฉลย, ดูผลการเล่น, รีเซ็ตเฉพาะราย

---

## โครงสร้างไฟล์

```text
/
├─ index.html                 # หน้าเล่นของนักเรียน
├─ admin.html                 # หน้า Admin
├─ app.js
├─ admin.js
├─ config.js                  # ใส่ Supabase URL + Publishable key
├─ supabase-client.js
├─ assets/style.css
├─ templates/students-template.csv
└─ supabase/
   ├─ schema.sql              # ตาราง + RLS + RPC ของเกม
   ├─ config.toml
   ├─ .env.example
   └─ functions/
      └─ admin-api/
         └─ index.ts          # Admin API ตรวจรหัสผ่านฝั่ง Server
```

## 1) สร้าง Supabase Project

สร้างโปรเจกต์ใหม่ใน Supabase แล้วเปิด **SQL Editor**

คัดลอกไฟล์ `supabase/schema.sql` ทั้งหมดไปรัน 1 ครั้ง

สิ่งที่จะถูกสร้าง:

- `students`
- `questions`
- `game_sessions`
- `game_answer_attempts`
- RPC สำหรับหน้าเกม
- RLS ป้องกันการอ่านตาราง/เฉลยโดยตรงจาก browser
- ช่องข้อสอบ 43 ป้าย × 3 ข้อ = 129 แถว

> เริ่มต้นข้อสอบทั้งหมดจะเป็น `is_active = false` จนกว่าครูจะกรอกข้อสอบแล้วเปิดใช้งาน

## 2) ตั้งรหัส Admin

ตั้ง Supabase Edge Function secret:

```bash
supabase secrets set ADMIN_PASSWORD=12341234
```

แนะนำเพิ่ม Origin ของ GitHub Pages หลังทราบ URL จริง เช่น

```bash
supabase secrets set ALLOWED_ORIGIN=https://USERNAME.github.io
```

ถ้าไม่ตั้ง `ALLOWED_ORIGIN` ระบบจะใช้ `*` เพื่อให้ติดตั้งครั้งแรกได้ง่าย

> รหัส `12341234` อยู่ใน Supabase Secret เท่านั้น ไม่ควรเขียนลง `admin.js` หรือ `config.js`

## 3) Deploy Edge Function สำหรับ Admin

ติดตั้ง/ล็อกอิน Supabase CLI แล้วจากโฟลเดอร์โปรเจกต์รัน:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy admin-api --no-verify-jwt
```

หรือสร้าง/deploy Function จาก Supabase Dashboard โดยใช้ไฟล์ `supabase/functions/admin-api/index.ts`

## 4) ตั้งค่า `config.js`

เปิด `config.js` แล้วแก้ 2 ค่า:

```js
export const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'YOUR_SUPABASE_PUBLISHABLE_KEY';
```

ใช้ **Publishable key** สำหรับ browser เท่านั้น ห้ามใช้ Secret key หรือ Service Role key ใน GitHub

## 5) อัปขึ้น GitHub Pages

1. สร้าง GitHub repository
2. อัปไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้น repository
3. ไปที่ **Settings → Pages**
4. เลือก **Deploy from a branch**
5. เลือก branch `main` และ folder `/(root)`
6. Save

หน้าเล่นจะเป็นประมาณ:

```text
https://USERNAME.github.io/REPOSITORY/
```

หน้า Admin:

```text
https://USERNAME.github.io/REPOSITORY/admin.html
```

## 6) นำเข้ารายชื่อนักเรียน

เข้า `admin.html` และกรอกรหัส Admin

ดาวน์โหลด Template จากหน้า Admin หรือใช้ไฟล์:

`templates/students-template.csv`

รูปแบบ:

```csv
student_code,prefix,first_name,last_name,class_name
33284,นาย,ธนกร,ตัวอย่าง,ม.6/7
33285,นางสาว,สมหญิง,ตัวอย่าง,ม.6/7
```

รองรับไฟล์นักเรียนหลายพันคน โดยหน้า Admin จะแบ่งส่งเป็นชุดละ 500 คนอัตโนมัติ

## 7) กรอกข้อสอบ 43 ป้าย

หน้า Admin → **ข้อสอบ** → เลือกป้าย 1-43

แต่ละป้ายมี:

- คำถามที่ 1
- คำถามที่ 2
- คำถามที่ 3
- ตัวเลือก A, B, C, D
- คำตอบที่ถูกต้อง
- เปิด/ปิดใช้งาน

ระบบจะเลือกเฉพาะป้ายที่ **เปิดใช้งานครบทั้ง 3 ข้อและมีตัวเลือก A-D ครบ**

ก่อนเปิดให้นักเรียนเล่น ต้องมีอย่างน้อย 25 ป้ายที่พร้อมครบ 3 ข้อ มิฉะนั้นระบบจะไม่สร้าง session เพื่อไม่ให้นักเรียนติดค้างกลางเกม

หากต้องการให้สุ่มได้จากป้ายทั้ง 43 ป้าย ให้เปิดใช้งานข้อสอบครบทั้ง **129 ข้อ**

## 8) การป้องกันเล่นซ้ำ

- `game_sessions.student_id` ถูกกำหนดเป็น `UNIQUE`
- เมื่อกดเริ่มเกมแล้ว รหัสนักเรียนเดิมจะสร้าง session ใหม่ไม่ได้ แม้เปลี่ยนเครื่องหรือล้าง browser
- Token ของ session เก็บใน `localStorage` ของอุปกรณ์เดิมเพื่อให้รีเฟรชแล้วเล่นต่อได้
- หากครูจำเป็นต้องให้เริ่มใหม่ ไปที่ Admin → ผลการเล่น → **รีเซ็ต**

## หมายเหตุด้านความปลอดภัย

- `config.js` เปิดเผยต่อสาธารณะตามธรรมชาติของ GitHub Pages จึงต้องใช้เฉพาะ Supabase Publishable key
- RLS และ RPC ใน `schema.sql` ถูกออกแบบไม่ให้ browser อ่านตาราง `questions` โดยตรง
- เฉลยถูกตรวจใน PostgreSQL และ `correct_option` ไม่ถูกส่งกลับไปยังหน้าเกม
- Service Role key ใช้เฉพาะใน Supabase Edge Function และห้ามนำขึ้น GitHub
- รหัส Admin `12341234` เป็นรหัสที่ตั้งตามโจทย์ หากเปิดระบบสู่สาธารณะจริงควรเปลี่ยนเป็นรหัสที่เดายากกว่า

## ทดสอบก่อนใช้งานจริง

1. เพิ่มนักเรียนทดสอบ 1 คน
2. กรอกข้อสอบให้พร้อมอย่างน้อย 25 ป้าย × 3 ข้อ
3. เปิดหน้าเกม ค้นหารหัส และกดเริ่ม
4. ตรวจว่าหน้าเกมไม่แสดงคำถาม/เฉลย มีเฉพาะป้ายและ A-D
5. ตรวจ milestone ที่ข้อ 10 และ 20
6. ตรวจจบอัตโนมัติที่ข้อ 25
7. ลองค้นหารหัสเดิมอีกครั้ง ต้องไม่สามารถเริ่มรอบใหม่ได้
8. ตรวจผลใน Admin

