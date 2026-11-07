# Prompt ส่งต่อ Claude: ทำ gameplay logic ของ Emberwood

> เอกสารประวัติการส่งต่องาน: รุ่นปัจจุบันเป็น 2.0.0 มีแคมเปญ 100 วัน อาวุธและมินิเกมแล้ว ข้อกำหนด 5 ระลอกด้านล่างเป็นของรุ่นก่อน ให้ยึด GAMEPLAY_NOTES.md และแผน 2026-11-06-100-days-plan.md สำหรับงานต่อไป

> สถานะเมื่อส่งต่องานครั้งก่อน: ผู้ใช้ให้ Codex ทำงานส่วนนี้ต่อแล้ว และเชื่อม gameplay ใน `emberwood.html` เรียบร้อย ไฟล์นี้เก็บไว้เป็นข้อกำหนดตอนส่งต่อ ดูวิธีเล่น ค่าที่เป็น ASSUMPTION และผลทดสอบล่าสุดใน `GAMEPLAY_NOTES.md` เปิด URL ปกติเพื่อเล่นจริง; `?preview=...` สงวนไว้ดูงานภาพ

คุณรับบท Gameplay Engineer ให้ลงมือทำระบบเกมต่อจากงานภาพที่เสร็จแล้ว ผู้ใช้แบ่งหน้าที่ชัดเจน: Codex ทำภาพ/Canvas/UI/responsive และคุณทำ code logic ห้ามเริ่มออกแบบภาพใหม่หรือเขียนเกมใหม่ทับงานภาพ

## อ่านไฟล์เหล่านี้ก่อน

- ไฟล์หลัก: `D:/Games/emberwood.html`
- สำรองเกมเดิมก่อนเปลี่ยน UI: `D:/Games/handoff/emberwood-legacy.html`
- แผนและขอบเขต UI: `D:/Games/docs/superpowers/plans/2026-11-06-reference-ui-plan.md`
- GIF อ้างอิง: `C:/Users/kkriangkai/Downloads/815636283.731242-ezgif.com-video-to-gif-converter.gif`
- ลำดับเฟรมและภาพเมนูที่แยกไว้: `C:/Users/kkriangkai/.codex/visualizations/2026/11/06/01a1af9c-479e-7310-a854-beb5dd0844ca/reference-analysis/`

ไฟล์เกมต้องคงเป็น HTML ไฟล์เดียว เปิดจากไฟล์โดยตรงได้ ไม่ใช้ไลบรารี เครือข่าย ฟอนต์ภายนอก หรือไฟล์ภาพประกอบ ภาพทั้งหมดมี renderer ของ Canvas อยู่แล้ว UI เป็นภาษาไทยและเต็มหน้าจอทั้งแนวตั้ง/แนวนอน

## สถานะตอนรับงาน — สำคัญมาก

`emberwood.html` ตอนนี้เป็น **presentation layer + visual fixtures เท่านั้น** ไม่ใช่เกมที่มีระบบต่อสู้ครบ การขยับเปลวไฟ ส่ายตัว เหวี่ยงขวาน หรือเอฟเฟกต์ เป็น animation งานภาพ การกดแปลงในโหมดพรีวิวเปิดเมนูและเลือก prepared snapshot ให้ดูภาพ ไม่ได้ตรวจไม้ ไม่ได้สร้างธุรกรรม และไม่ได้จำลอง AI

มี `<script>` 3 ส่วน:

1. `id="presentation-layer"`: งานภาพ, renderer, HUD, เมนู, input intents และ API — รักษาส่วนนี้ไว้
2. `id="visual-preview-fixtures"`: ข้อมูลภาพตัวอย่างและตัวควบคุมพรีวิว — ไม่ใช่หลักฐานของกติกาเกม
3. `id="game-logic"`: จุดให้คุณเพิ่ม gameplay controller

ปัจจุบัน default เปิด visual preview; `?runtime=logic` ปิดตัวควบคุมพรีวิว แต่ยังวาด snapshot ตั้งต้นให้รอ engine เมื่อเชื่อมเสร็จ **ให้เปิดเกมจริงเป็น default** และเก็บ visual fixtures ไว้หลัง `?preview=scene|build|cannon|archer|flame|effects` เท่านั้น อย่าให้ fixture controller กับ engine ทำงานพร้อมกัน

เกมเก่าเก็บไว้ครบใน `handoff/emberwood-legacy.html` เพื่ออ่านแนวทางได้ แต่ห้ามรันสคริปต์เก่าทั้งชุดร่วมกับ renderer ใหม่ เพราะจะมี renderer/input/RAF ซ้ำ และกติกาอัปเกรดกองไฟเดิมไม่ตรงคลิป

## ข้อเท็จจริงจากภาพอ้างอิง

- GIF เป็น 540×960, 50 เฟรม, 5 วินาที ส่วนภาพหน้าต่างเล่นวิดีโอระบุความยาวคลิปเต็ม 23 วินาที เราไม่ได้มีทุกช่วงของคลิปนั้น
- ไม้ในกระเป๋าและไม้ในแปลงเป็นคนละค่า: เริ่มเห็นกระเป๋า 13 / แปลง 23/30 → กระเป๋า 11 / แปลง 25/30 → กระเป๋า 6 / แปลง 30/30
- การยืนเข้าใกล้แปลงเห็นไม้ทยอยถูกส่งเข้าไป ให้ทำ auto-deposit ขณะอยู่ในระยะ
- เมื่อแปลงครบ 30 เปิดเมนูเลือกหนึ่งในสามป้อม: `cannon`, `archer`, `flame`
- หลังเลือก ป้อมเกิดบนแปลง กองไฟยังอยู่แยกต่างหาก มีดาวเหนือป้อม และป้ายรอบถัดไปเป็น “อัปเกรด 0/60”
- ปืนใหญ่ยิงกระสุน ดาเมจเป็นพื้นที่; ธนูดาเมจสูงเป้าหมายเดียว; พ่นไฟระยะใกล้และเผาไหม้ต่อเนื่อง ตามข้อความบนการ์ด
- เห็นวงสีแดงโปร่งรอบปืนใหญ่, ตัวเลขดาเมจสีขาว −10/−20/−100 และสีแดง −5 แต่ยังจับคู่ค่าทุกตัวกับต้นเหตุอย่างมั่นใจไม่ได้
- เห็นระลอก 1/5 และจำนวนศัตรูลดจาก 9 เป็น 8

สิ่งที่ **ยังไม่ยืนยัน**: ราคาหลัง 60, ความหมายแน่นอนของแถบแดง/วงกลมเลข 2, ผลของสีเหลือง–ม่วง–น้ำเงิน–เขียว, HP/ความเร็ว/ดรอปของศัตรูทุกชนิด, ค่าพลัง/ระยะ/ช่วงยิงของแต่ละป้อม, เมนูอัปเกรดหลังเติม 60, การฮีลจากกองไฟ, สภาวะชนะ/แพ้ที่แท้จริง

รวมค่าที่ต้องเลือกชั่วคราวไว้ใน CONFIG พร้อมคอมเมนต์ `ASSUMPTION` อย่าอ้างว่าเป็นค่าถอดจากต้นฉบับ ใช้กองไฟเป็นแสงก่อน ไม่เพิ่มการฮีลหรือบัฟขวานโดยถือว่าเป็นกติกาต้นฉบับ

## งาน logic ที่ต้องทำ

1. Engine state เป็นเจ้าของข้อมูลเกมทั้งหมด ใช้ dt ที่จำกัดหลังสลับแท็บ และแยกเวลาเล่นออกจาก visual animation
2. เดินด้วย WASD/ลูกศร/จอยจาก input intent; normalize แนวทแยง; collision และขอบเขตโลก; camera follow โดยไม่ยืดภาพและไม่ย้ายตำแหน่งโลกเวลา resize
3. ศัตรูเกิด/เดินไล่/ชน/รับดาเมจ/ตาย/ดรอป ทรัพยากรเก็บได้จริง และตัวนับคงเหลือลดตามการตายจริง
4. ขวานหมุนโจมตีตาม angle ที่ engine ส่งให้ภาพ มี cooldown หรือการจำ hit ต่อรอบเพื่อไม่โจมตีซ้ำทุกเฟรม ค่า damage/knockback/i-frame อยู่ CONFIG
5. แยก `bagWood` กับ `site.deposited`; auto-deposit ทีละท่อนเมื่ออยู่ในระยะ ไม่เกินที่กระเป๋ามีและแปลงยังขาด ห้ามหักไม้ติดลบ/หักซ้ำ
6. แปลงสะสม 30 ครบ → state รอเลือก → เปิด UI ครั้งเดียว โดยสร้าง `requestId` ที่ไม่ซ้ำ ห้ามผูกกับทุก render/frame
7. รับผลเลือกป้อม ตรวจ site/request/status/type อีกครั้ง ทำธุรกรรมได้ครั้งเดียว ป้อมเกิดบนแปลง แล้วเปลี่ยนแปลงเป็น upgrade `0/60`; ไม่ลบหรืออัปเกรดกองไฟ
8. สะสมไม้ครบ 60 ต้องมีผลการอัปเกรดจริง กติกาหลังจากนี้ยังไม่เห็นในคลิป เลือกค่าชั่วคราวที่เรียบง่าย ระบุสมมติฐานชัดเจน และไม่แต่งว่าต้นฉบับทำเช่นนั้น
9. ป้อม: เลือกเป้าหมาย/ระยะ/cooldown; ปืนใหญ่ projectile + impact AoE; ธนู projectile เป้าหมายเดียว; พ่นไฟและ burn ticks; ไม่มี ghost damage จากกระสุนหมดอายุหรือเป้าหมายตาย
10. ระบบ 5 ระลอก, ช่วงพัก, win/loss, restart ที่ล้าง entity/timer/input/projectile/status/menu/request ทั้งหมดอย่างถูกต้อง
11. Pause ทุกระบบเมื่อ menu เปิด/แท็บไม่ active; resume ไม่ catch-up ดาเมจหรือไม้ย้อนหลัง; ป้องกันหลายเมนูทำให้ pause หลุดก่อนเวลา
12. ทดสอบ behavior ที่สำคัญ แล้วรันเกมในเบราว์เซอร์จริง ตรวจเมนู/การเคลื่อนที่/การก่อสร้าง/ป้อมทั้งสาม/การหมุนจอ

## API งานภาพจริงที่มีให้ใช้

```js
const UI = window.EmberwoodUI; // version: 1
UI.setSnapshot(completeSnapshot); // deep-copy ข้อมูล ไม่เปลี่ยนข้อมูลของ engine
UI.getSnapshot();                // สำเนาของ snapshot ปัจจุบัน (ใช้ตรวจงาน)
UI.getViewport();                // สำเนา {width,height,scale,dpr,left,top}
UI.project({x,y});               // world → CSS pixels: {x,y,scale}
const unsubscribe = UI.onAction(handleAction);

UI.openBuildMenu({
  siteId: 'site-1', requestId: 'build-1',
  options: ['cannon','archer','flame']
});
UI.setBuildPending(true);       // disabled cards + ข้อความกำลังรอ
UI.setBuildPending(false);      // ให้เลือกใหม่ได้เมื่อ reject
UI.closeBuildMenu();
UI.openSettings();              // เปิดหน้าพักเกมถ้าไม่มี modal อื่นเปิด
UI.closeMenus();                // ปิด modal ทั้งหมดและล้าง input ภาพ
UI.showToast('ข้อความภาษาไทย');
UI.showResult({won:true,waves:5,kills:85,time:'3:20',description:'...'});
```

Renderer มี RAF ของตัวเองอยู่แล้ว คุณเพิ่ม engine update loop ได้ แต่ห้ามเพิ่ม renderer/Canvas อีกชุด ให้เรียก `setSnapshot` เมื่อ engine อัปเดตข้อมูล (ไม่จำเป็นต้องสร้าง canvas/art ใหม่)

### Action events

`UI.onAction` รับ object `{type,...payload}`:

| type | payload | หน้าที่ engine |
|---|---|---|
| `input:change` | `{x,y}` normalized vector | เก็บทิศเดินล่าสุด; UI ไม่ย้ายตัวละครให้ |
| `site:interact` | `{siteId}` | เจตนาจากคลิกแปลง/กด B; ตรวจระยะและสถานะเอง ไม่ใช้แทนการตรวจไม้ |
| `build:select` | `{siteId,requestId,towerType}` | ตรวจคำขอและเลือกป้อมครั้งเดียว; UI disable การ์ดไว้จน owner ตอบ |
| `build:cancel` | `{siteId,requestId}` | เจตนา Esc; เลือกว่าจะปิดหรือคงเมนู หากต้องเลือกก่อนให้คง pause และเมนูไว้ |
| `menu:state` | `{menu:'build'|'settings'|'help'|'result',open}` | ใช้ Set เก็บชื่อเมนูที่เปิด; pause เมื่อ Set ไม่ว่าง อย่าใช้ bool ล่าสุดอย่างเดียว |
| `view:inactive` | ไม่มี | clear movement และพัก engine; เปิด settings ถ้าเหมาะสม |
| `game:restart` | ไม่มี | reset engine, closeMenus, ส่ง snapshot เริ่มใหม่ |

UI ไม่ได้ pause engine ให้เอง `resetInput`/เปิดปิด modal อาจส่ง `input:change {0,0}` ระหว่างจัดการ event ได้ จัด handler ให้รองรับ event ซ้อนอย่างปลอดภัย เมื่อเลือกสำเร็จให้ commit engine ก่อน จากนั้น `setSnapshot` และ `closeBuildMenu`; เมื่อปฏิเสธให้ `setBuildPending(false)` + `showToast`

### Snapshot schema

ค่าตำแหน่งเป็น **world units** ไม่ใช่ CSS pixels; มุมเป็น radians; HP และ progress สำหรับภาพเป็น normalized 0..1; ทรัพยากรเป็นจำนวนเต็ม Render ไม่คำนวณ HP/damage/deposit/target แทน engine

```js
{
  hud: {
    wave:1, totalWaves:5, remaining:9,
    gems:0, coins:3, wood:13, // wood = ในกระเป๋าเท่านั้น
    progress:0.32, badge:2   // ความหมายยังไม่ยืนยันจากคลิป
  },
  camera: {x:270,y:480,zoom:1}, // จุดกึ่งกลางกล้องในโลก
  player: {
    x:245,y:500,hp:1,moving:false,flash:0,
    axe:{angle:0.7,animate:false,radius:78}
    // เกมจริงใช้ animate:false และ engine ส่ง angle ที่ใช้ collision มาด้วย
    // animate:true สงวนไว้พรีวิวภาพ จะหมุนด้วย visual clock
  },
  fire: {x:216,y:830,lightRadius:145}, // radius นี้เป็นแสง ไม่ใช่ฮีล
  site: {
    id:'site-1',x:216,y:650,
    label:'สร้าง',appearance:'build', // หลังสร้าง: 'อัปเกรด' / 'upgrade'
    deposited:23,required:30,visible:true,showLabel:true
  }, // ใช้ null เพื่อซ่อนแปลง
  enemies: [
    {id:'e1',x:326,y:287,moving:true,phase:1,flash:0,hp:1,opacity:1}
  ],
  towers: [
    {id:'t1',type:'cannon',x:270,y:502,level:1,showRange:true,range:218}
  ], // type: cannon | archer | flame
  pickups: [{type:'coin',x:238,y:384,phase:0,scale:0.6}], // coin | wood | gem
  projectiles: [{type:'arrow',x:325,y:391,angle:-0.8}], // arrow | cannon
  effects: [
    {type:'impact',x:363,y:508,progress:0.35,radius:35},
    {type:'flame',x:283,y:450,angle:-0.3,length:105,width:34},
    {type:'burn',x:364,y:490}
  ],
  damageTexts: [
    {text:'−20',x:364,y:477,progress:0.2,size:24},
    {text:'−5',x:255,y:424,kind:'friendly',progress:0.1}
  ],
  // optional: trees array แทนป่าตกแต่งเริ่มต้นทั้งหมด
  trees: [{x:30,y:260,kind:'round',scale:1,phase:0}]
}
```

Arrays เป็น complete snapshot: ส่งรายการที่ยังมีชีวิต/ยังแสดงในเฟรมนั้น Engine เป็นเจ้าของอายุ/ตำแหน่ง/การลบ projectile, effect และ damageTexts หาก `trees` ไม่ส่ง renderer จะวาดป่าตกแต่งเดิมเอง; ป่านั้นไม่ได้เป็น collider โดยอัตโนมัติ ถ้าต้องตัดต้นไม้หรือชนต้นไม้ ให้ engine เป็นเจ้าของต้นไม้และส่ง `trees` ที่ตรงกับ collider

มีฟังก์ชันวาดพร้อมใช้ใน `UI.art`: `drawPlayer, drawEnemy, drawTree, drawCampfire, drawAxe, drawAttackVFX, drawTower, drawRange, drawProjectile, drawEffect, drawDamage, drawResource` ปกติไม่ต้องเรียกเอง ให้ส่ง snapshot แล้ว renderer จะจัดเลเยอร์ตาม y ให้

## ห้ามเปลี่ยนสิ่งเหล่านี้โดยไม่จำเป็นกับ logic

- สไตล์ตัวละครผมแดง/ซอมบี้ขวานบนหัว/ป่าต้นสนผสมพุ่มกลม/วงหินกองไฟ
- HUD เฟืองซ้าย, ข้อความขาวขอบดำ, แถบแดงยาว, badge น้ำเงิน, ทรัพยากรไม่มีกรอบใหญ่
- เมนูสามการ์ดสีเขียว, แบนเนอร์ฟ้า, เครื่องหมายเหลือง–ม่วง–น้ำเงิน–เขียว, ชื่อ/รูปป้อม
- ภาษาไทย, fullscreen responsive, สเกลภาพแบบ uniform และพิกัดโลกที่ไม่ถูกแก้เมื่อ resize
- อย่าเพิ่ม UI debug ในหน้าจอเล่นปกติ; อย่าโหลด asset/SDK จากภายนอก

หาก logic จำเป็นต้องมีสถานะภาพเพิ่ม ให้เพิ่ม property/API ขนาดเล็กเข้ากับ presentation layer เดิม ไม่รีดีไซน์หรือย้ายไป framework

## Acceptance tests ของงานคุณ

รัน guard ของงานภาพด้วย `node D:/Games/tests/presentation.test.cjs` เทสต์นี้ตรวจ presentation block และ fixture contract โดยไม่รัน gameplay block จึงไม่ใช่หลักฐานว่า logic เกมผ่าน คุณต้องเพิ่มและรันเทสต์ gameplay ของตนเองด้วย

- 29/30 ไม่เปิดเมนู; 30/30 เปิดครั้งเดียว แม้ update อีกหลายร้อยเฟรม
- การฝากไม้ทุกท่อนอนุรักษ์ยอด `bag + deposited` ก่อนสร้าง; bag ไม่ติดลบ; เลือกการ์ดไม่หักไม้ซ้ำ
- แปลงที่ยังไม่ครบและผู้เล่นอยู่นอกระยะไม่สร้างป้อม
- ทุกป้อมเลือกได้และสร้างถูกชนิด/ถูกตำแหน่ง; กองไฟยังอยู่; แปลงถัดไปเป็น 0/60
- สแปมคลิก, pending, request เก่า และ event ซ้ำ ไม่สร้างหลายป้อม/หักของซ้ำ
- cannon AoE, archer single-target และ flame burn ทำงานจริงและไม่ใช้ดาเมจทุก render frame
- pause/settings/help/build/result/blur หยุดระบบเกมทั้งหมด; resume ไม่มี time-jump และไม่มีปุ่มเดินค้าง
- restart จากทุก modal ล้างสถานะทั้งหมด และไม่เพิ่ม event listener/loop ซ้ำ
- 5 ระลอกชนะได้ และ HP หมดแพ้ได้; ตัวนับศัตรูตรงกับศัตรูที่มีชีวิต
- ทดสอบ 392×533, 375×812, 844×390, 1280×720; ไม่มี scroll หน้าเกม/การ์ดล้น; หมุนจอไม่เปลี่ยนพิกัดโลก ทรัพยากร หรือระดับป้อม
- เปิด HTML จากไฟล์ได้โดยไม่ต้องมี server; ไม่มี console error/ไฟล์ภายนอก

## สิ่งที่ต้องส่งกลับ

สถานะ frontend ตอนส่งต่อ: `node D:/Games/tests/presentation.test.cjs` ผ่าน 11 checks; ตรวจเมนูจริงที่ 320×480, 392×533, 375×812, 844×390 และ 1280×720 การ์ดครบสามใบ ไม่มี overflow แนวนอน/แนวตั้ง ตรวจเลือกภาพป้อมทั้งสาม, โหมด `runtime=logic` ไม่เปิดเมนูเอง และไม่มี console error ที่พบระหว่างตรวจ ทั้งหมดนี้เป็นการตรวจงานภาพ/API ไม่ใช่การทดสอบ gameplay

ภาพตรวจงานที่บันทึกไว้:
- `C:/Users/kkriangkai/.codex/visualizations/2026/11/06/01a1af9c-479e-7310-a854-beb5dd0844ca/emberwood-ui-build-menu.jpg`
- `C:/Users/kkriangkai/.codex/visualizations/2026/11/06/01a1af9c-479e-7310-a854-beb5dd0844ca/emberwood-ui-effects.jpg`

1. แก้ `D:/Games/emberwood.html` ให้เกมจริงเล่นได้ โดยคงงานภาพเดิม
2. สรุปกติกาที่เชื่อมจริงและค่าที่เป็น ASSUMPTION
3. ระบุการทดสอบที่รันและผลที่เห็นจริง พร้อมข้อจำกัดที่ยังเหลือ
4. อย่าแก้ backup; ใช้มันเป็นเอกสารอ้างอิงเท่านั้น

ลงมือดำเนินงาน logic ตามขอบเขตนี้ให้ครบ ไม่จบที่เสนอแผนหรือสร้าง mock เพิ่ม
