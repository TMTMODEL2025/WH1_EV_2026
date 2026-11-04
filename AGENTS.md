# AGENTS.md

# TMT EV Charging Management System

Version: 1.0

---

# Purpose

This document defines the mandatory behavior of AI when developing this project.

AI must always follow these instructions.

These rules override default assumptions.

The goal is to produce production-quality software that is maintainable, scalable, and safe for real-world industrial use.

---

# AI Roles

The AI must simultaneously act as:

* Senior Software Architect
* Senior Full Stack Engineer
* Google Apps Script Expert
* Google Sheets Database Architect
* Frontend Engineer
* UI/UX Designer
* Performance Engineer
* Security Reviewer
* QA Engineer
* Technical Writer

Always consider all perspectives before generating code.

---

# Project Goal

Build a Production-Ready EV Charging Management System.

This project is NOT a demo.

This project is NOT a prototype.

The system will be used by real employees inside a factory.

Every feature must be reliable.

---

# Technology Stack

Frontend

* HTML5
* CSS3
* Bootstrap 5
* Vanilla JavaScript (ES2023)

Backend

* Google Apps Script

Database

* Google Sheets

Charts

* Chart.js

Notification

* LINE Messaging API (or configured LINE service)

---

# Forbidden Technologies

Never use

* Firebase
* Supabase
* MongoDB
* MySQL
* PostgreSQL
* SQLite
* IndexedDB as the primary database

Do not replace Google Sheets with another database.

---

# Project Architecture

Frontend

↓

Google Apps Script REST API

↓

Google Sheets

All communication must go through the API.

Frontend must never access Google Sheets directly.

---

# Development Principles

Always preserve existing working features.

Never rewrite working modules without a valid reason.

Never change unrelated code.

Never remove functionality unless explicitly instructed.

Implement only the requested scope.

---

# Business Rules

One charger can charge only one vehicle.

One vehicle can use only one charger.

Drivers are not assigned permanently to vehicles.

Login is required every charging session.

Vehicle mileage must always increase.

Charging stops automatically at 100%.

Charging history must never be deleted.

---

# Google Sheets Rules

Google Sheets is the system database.

Do not use Google Sheets for real-time calculations.

Do not calculate battery percentage in Google Sheets.

Do not calculate countdown timers in Google Sheets.

Google Sheets stores data only.

---

# Performance Rules

Perform all charging calculations inside the browser.

Do not update Google Sheets every second.

Write data only when:

* Login
* Start Charging
* Finish Charging
* Admin Update

Use

* CacheService
* LockService
* Batch Read
* Batch Write

Avoid unnecessary reads.

Never call getDataRange() unless absolutely necessary.

---

# Database Rules

Use normalized sheets.

Recommended sheets

* Users
* Vehicles
* Chargers
* ActiveSessions
* ChargingHistory
* Settings
* Logs

Never duplicate information.

Always use unique IDs.

---

# API Rules

All frontend communication must use REST APIs.

Every API must

Validate input.

Handle errors.

Return JSON.

Return HTTP status.

Never expose internal errors.

---

# UI Rules

Responsive Design

Mobile First

Desktop Compatible

Thai Language Support

Fast Loading

Clean Layout

Corporate Style

Modern Dashboard

Do not use unnecessary animations.

Animations must never reduce usability.

---

# Code Quality

Write modular code.

Separate HTML, CSS, and JavaScript.

Avoid duplicated code.

Use reusable components.

Use meaningful variable names.

Use async/await.

Never use inline JavaScript.

Never use jQuery.

---

# Security Rules

Validate every request.

Validate every input.

Escape HTML.

Sanitize data.

Never trust client-side input.

Never expose passwords.

Do not store sensitive data in JavaScript.

---

# Error Handling

Every API must return

Success

Message

Data

Error

Display user-friendly error messages.

Never display stack traces.

---

# Logging

Log important events

Login

Start Charging

Finish Charging

System Error

Admin Action

Store logs in Google Sheets.

---

# Documentation Rules

Whenever code changes

Update

README

CHANGELOG

Relevant documentation

Document all new APIs.

Document database changes.

---

# File Management

Do not create duplicate files.

Reuse existing modules.

Maintain project structure.

Keep folders organized.

---

# Naming Convention

Use consistent names.

Example

getVehicle()

updateCharging()

finishSession()

Avoid unclear names.

---

# Future Scalability

Design for

More chargers

More vehicles

Multiple departments

Multiple factories

Additional reports

Offline support

Future mobile application

Never hardcode system limits.

---

# AI Behavior

Before writing code

Read the existing project.

Understand the current architecture.

Understand the business rules.

Understand database relationships.

Never assume missing requirements.

If information is missing

State the assumption clearly.

Do not invent hidden business logic.

---

# Response Format

When modifying code

Always report

Files Changed

Purpose

Summary

Potential Impact

Testing Required

Do not explain unrelated topics.

Focus only on requested changes.

---

# Final Goal

The generated software must be

Reliable

Maintainable

Scalable

Readable

Production Ready

Suitable for long-term industrial operation.

# ทุกครั้งที่มีการทำรายการสำเร็จหรือยืนยัน ต้องแสดงSweetalert แจ้งเตือน หรือ Animation หน่วงเวลา
# ทุกฟังชั่นต้องทดสอบว่าใช้งานได้จริง
# เมื่อมีข้อมูลแสดงแบบตาราง ให้มีการจัดกลุ่มตามวันที่เป็นค่าเริ่มต้น และสามารถย่อ-ขยายได้ ตั้งค่าเริ่มต้นให้เป็นแบบย่อไว้
# เมื่อมีข้อมูลเกี่ยวกับเวลาให้ใช้เป็น +07:00 อย่างในปัจจุบันสำหรับประเทศไทย
# ห้ามใช้ข้อมูลจำลอง MOC DATA (Fallback / Mock Data)


# RESPONSIVE UI MASTER PROMPT

## Objective
ออกแบบและพัฒนา Web Application ให้รองรับทุกขนาดหน้าจอ (Responsive Design) โดยใช้แนวคิด Mobile First และสามารถใช้งานได้อย่างสมบูรณ์ทั้ง

- Desktop (1920px+)
- Laptop (1366px)
- Tablet (768px–1024px)
- Mobile (320px–767px)

ห้ามสร้าง UI ที่เหมาะกับ Desktop เพียงอย่างเดียว

---

# Responsive Requirements

## Mobile First

เริ่มออกแบบจากหน้าจอมือถือก่อน

Breakpoint

Mobile
0-767px

Tablet
768-1023px

Desktop
1024px+

Large Desktop
1440px+

---

## Layout

Desktop

- Sidebar แสดงตลอดเวลา
- Top Navigation
- Dashboard หลายคอลัมน์
- Table เต็มความกว้าง

Tablet

- Sidebar ย่อได้
- Card 2 Columns
- Table Scroll แนวนอน

Mobile

- Sidebar เปลี่ยนเป็น Drawer
- Card เรียง 1 Column
- ปุ่มเต็มความกว้าง
- เมนู Hamburger
- ไม่มี Horizontal Scroll ของทั้งหน้า

---

# Navigation

Desktop

Sidebar + Topbar

Tablet

Collapsible Sidebar

Mobile

Hamburger Menu

Slide Drawer

ปิด Drawer อัตโนมัติเมื่อเลือกเมนู

---

# Dashboard

Desktop

4 Cards ต่อแถว

Tablet

2 Cards ต่อแถว

Mobile

1 Card ต่อแถว

Cards ต้องปรับขนาดอัตโนมัติ

---

# Tables

Desktop

Table ปกติ

Tablet

Scrollable

Mobile

เปลี่ยนเป็น Card Layout อัตโนมัติ

ตัวอย่าง

ชื่อสินค้า

Film A

จำนวน

120

สถานะ

Available

แทนการแสดง Table เต็ม

---

# Forms

Desktop

Label อยู่ซ้าย

Input อยู่ขวา

2 Columns

Tablet

2 Columns

Mobile

1 Column

Input กว้าง 100%

Button เต็มความกว้าง

Spacing อย่างน้อย 16px

---

# Buttons

Desktop

Auto Width

Mobile

Minimum Height

48px

Minimum Width

44px

Touch Friendly

---

# Typography

Desktop

Heading

32px

Subheading

24px

Body

16px

Mobile

Heading

24px

Subheading

20px

Body

16px

Small

14px

---

# Icons

Desktop

24px

Mobile

20-24px

---

# Images

ใช้

max-width:100%

height:auto

ห้ามกำหนด Width คงที่

---

# Cards

Desktop

Grid

4 Columns

Tablet

2 Columns

Mobile

1 Column

Cards สูงเท่ากัน

---

# Dialog

Desktop

Centered Modal

Mobile

Bottom Sheet

หรือ

Fullscreen Modal

---

# Charts

Desktop

เต็มพื้นที่

Tablet

Responsive

Mobile

Scrollable

หรือ

Resize อัตโนมัติ

---

# Tables

ห้ามล้นจอ

ห้ามตัดข้อความสำคัญ

รองรับ

overflow-x:auto

เมื่อจำเป็น

---

# Performance

Lazy Loading

Image Optimization

Code Splitting

Virtual Scroll สำหรับ Table ใหญ่

---

# Accessibility

Touch Target

>=44px

Contrast

WCAG AA

Keyboard Navigation

รองรับ

Focus Visible

รองรับ

---

# CSS Rules

ใช้

CSS Grid

Flexbox

Clamp()

Min()

Max()

Aspect Ratio

Container Width

max-width

1200-1440px

Margin Auto

---

# Safe Area

รองรับ

iPhone Notch

Safe Area Insets

---

# Orientation

รองรับ

Portrait

Landscape

---

# Browser Support

Chrome

Edge

Safari

Firefox

Android Chrome

iPhone Safari

---

# Responsive Testing

ทุกครั้งหลัง Build ต้องตรวจสอบว่า

✓ Desktop

1920px

✓ Laptop

1366px

✓ Tablet

1024px

✓ iPad Mini

768px

✓ iPhone 16

393px

✓ iPhone SE

375px

✓ Android Small

360px

✓ Galaxy Fold

280px

ห้ามมี

- Horizontal Scroll
- ข้อความล้น
- ปุ่มทับกัน
- Card แตก Layout
- ตารางล้นจอ
- เมนูเกินหน้าจอ

---

# Coding Standard

- ใช้ Flexbox/Grid ทุก Layout
- หลีกเลี่ยงการใช้ Fixed Width
- ใช้ Relative Units เช่น %, rem, em, vw, vh
- ใช้ CSS Variables สำหรับ Theme
- รองรับ Dark Mode และ Light Mode
- ใช้ Animation ที่ลื่นไหล ไม่กระทบประสิทธิภาพ

---

# Final Requirement

ก่อนถือว่างานเสร็จ AI ต้องตรวจสอบ Responsive ของทุกหน้า ทุก Component และทุก Dialog ให้สามารถใช้งานได้จริงบน Desktop, Tablet และ Mobile โดยไม่เกิด Layout แตก, ข้อความล้น, ปุ่มซ้อน, หรือการเลื่อนแนวนอนที่ไม่จำเป็น

Responsive ถือเป็นส่วนหนึ่งของ Definition of Done หากยังไม่ผ่านทุกขนาดหน้าจอ ห้ามถือว่างานเสร็จสมบูรณ์



