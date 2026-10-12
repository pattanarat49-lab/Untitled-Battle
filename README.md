# Untitled Battle

เกมต่อสู้แบบผลัดกันเทิร์นสไตล์ Pokemon ที่ใช้ฮีโร่ทั้ง 171 ตัวจาก **Riftborn** (ภาพ สเตตัส และสกิลดึงมาจาก repo `pattanarat49-lab/Game-`)

A turn-based, Pokemon-style battle game starring the heroes of Riftborn. Plain HTML/CSS/JS, no build step.

## เล่นยังไง

- เปิด `index.html` ในเบราว์เซอร์ (หรือรัน `python3 -m http.server` แล้วเข้า http://localhost:8000)
- **1 PLAYER**: เลือกทีม 3 ตัว สู้กับทีมสุ่มของ CPU
- **2 PLAYERS**: สองคนเลือกทีมแล้วผลัดกันกดบนเครื่องเดียว (จอจะสลับมุมมองให้คนที่ถึงตา)
- แต่ละเทิร์นเลือก **FIGHT** (ร่ายสกิล) · **BAG** (Potion / Ether / Revive) · **TEAM** (สลับฮีโร่) · **RUN** (หนี/ยอมแพ้)
- ปุ่ม: ลูกศร เลือก · Z / Enter ตกลง · X / Esc ย้อนกลับ หรือคลิก/แตะได้เลย

## กติกา

- ทุกฮีโร่มี 4 ท่า: ท่าโจมตีพื้นฐาน + สกิล Q และ E จาก Riftborn (+ ท่าเสริมถ้ามีสกิลไม่ครบ) แต่ละท่ามี PP จำกัด
- ผลของสกิลอ่านจากคำอธิบายใน Riftborn: สกิลฮีลจะฟื้น HP, สกิลสตัน/แช่แข็งมีโอกาสทำให้ศัตรูข้ามเทิร์น, สกิลไฟมีโอกาสติดไฟ, สกิลโล่ตั้งการ์ด, สกิลแปลงร่าง/เร่งพลังเพิ่มพลังโจมตี
- ธาตุมาจากการโจมตีพื้นฐาน: FIST > SHOT/VOLT, BLADE > FIST, ARCANE > BLADE, SHOT > ARCANE, VOLT > BLADE/SHOT (ชนะทางกัน = ดาเมจ x2, แพ้ทาง = x0.5)
- ฮีโร่ที่ถึกใน Riftborn ได้ HP เยอะแต่ตีเบากว่า เพื่อให้ทุกตัวสู้กันได้
- ตัวที่เร็วกว่าเริ่มก่อน แล้วผลัดกันทีละเทิร์น

## อัปเดตฮีโร่จาก Riftborn

`data/heroes.js` และ `assets/heroes/*.png` สร้างจาก repo Riftborn ด้วยสคริปต์:

```sh
git clone https://github.com/pattanarat49-lab/Game- ../Game-
npx esbuild tools/import-riftborn.ts --bundle --platform=node --outfile=/tmp/import.js --alias:riftborn=../Game- && node /tmp/import.js
```
