// Bundled DEMO defaults. Business labels, counts, order and limits live here,
// ready for a future approved JSON configuration adapter. No live endpoints.
const pair = (ar, en) => ({ ar, en });
const services = Object.fromEntries([
 ['out','car','نازل أصور','Heading out'],['call','phone','اتصال','Call'],
 ['crisis','alert','الأزمات','Crisis'],['swap','swap','تبديل/إجازة','Swap/leave'],
 ['track','pin','تتبّع مهمتي','My tracking'],['notices','bell','تنويهاتي','My notices'],
 ['courses','award','دوراتي','My courses'],['hours','clock','ساعاتي','My hours'],
 ['duty','phone','طلب للمناوب','Call on-duty'],['assign','send','تكليف مباشر','Direct assign'],
 ['field','pin','في الميدان','In the field'],['branches','orders','طلبات الفروع','Branch requests'],
 ['periods','calendar','برامج الفترات','Shift programmes'],['productivity','trend','الإنتاجية','Productivity'],
 ['org','team','الهيكل','Structure'],['projects','orders','المشاريع','Projects'],
 ['newprogramme','plus','برنامج جديد','New programme'],['availability','calendar','التوفر','Availability'],
 ['programmes','calendar','البرامج','Programmes'],['newrequest','plus','طلب جديد','New request'],
 ['drone','camera','تصريح درون','Drone permit'],['myrequests','orders','طلباتي','My requests'],
 ['tasks','camera','مهامي','Tasks'],['orders','orders','الطلبات','Orders'],
 ['indicators','trend','المؤشرات','Indicators'],['alerts','bell','التنبيهات','Alerts'],
 ['account','user','حسابي','Account']
].map(([id,icon,ar,en]) => [id,{icon,title:pair(ar,en)}]));
const roles = {
 ph:{title:pair('المصور','Photographer'),mil:'90001',tab:'tasks',shortcuts:['out','call','crisis','swap','track','notices','courses','hours'],focal:'task'},
 lead:{title:pair('مدير التصوير','Photo manager'),mil:'90002',tab:'orders',shortcuts:['duty','assign','call','crisis','field','branches','periods','productivity'],focal:'unfilled'},
 sup:{title:pair('المشرف','Supervisor'),mil:'90003',tab:'orders',shortcuts:['duty','assign','call','crisis','field','branches','periods','productivity'],focal:'unfilled'},
 dir:{title:pair('مدير الإدارة','Department director'),mil:'90004',tab:'indicators',shortcuts:['assign','duty','call','crisis','field','org','projects','courses'],focal:'approval'},
 prog:{title:pair('المنسق','Coordinator'),mil:'90005',tab:'programmes',shortcuts:['newprogramme','availability','call','programmes','periods'],focal:'programme'},
 req:{title:pair('مقدّم الطلب','Requester'),mil:'90006',tab:'myrequests',shortcuts:['newrequest','drone','call','myrequests'],focal:'request'}
};
const people = [
 ['90001','مصور تجريبي 1','Demo Photographer 1'],['90002','مدير تصوير تجريبي','Demo Photo Manager'],
 ['90003','مشرف تجريبي','Demo Supervisor'],['90004','مدير إدارة تجريبي','Demo Director'],
 ['90005','منسق تجريبي','Demo Coordinator'],['90006','مقدم طلب تجريبي','Demo Requester']
].map(([mil,ar,en])=>({mil,name:pair(ar,en)}));
const items = [
 {id:'DEMO-T-01',for:['90001'],kind:'task',icon:'camera',title:pair('تغطية فعالية تجريبية','Demo event coverage'),sub:pair('قاعة تجريبية · اليوم 09:00 – 11:00','Demo hall · today 09:00 – 11:00'),status:pair('بانتظار الرد','Awaiting response'),tone:'warn'},
 {id:'DEMO-P-01',for:['90001','90005'],kind:'programme',icon:'calendar',title:pair('دعوة برنامج تجريبي','Demo programme invitation'),sub:pair('مصور تجريبي 1 · غداً 10:00','Demo Photographer 1 · tomorrow 10:00'),status:pair('دعوة برنامج','Programme invite'),tone:'info'},
 {id:'DEMO-N-01',for:['90001'],kind:'notice',icon:'bell',title:pair('تنويه تجريبي للفريق','Demo team notice'),sub:pair('تعليمات تجهيز المعدات','Equipment preparation guidance'),status:pair('جديد','New'),tone:'info'},
 {id:'DEMO-U-01',for:['90002','90003'],kind:'unfilled',icon:'team',title:pair('طلب تجريبي يحتاج مصوراً','Demo request needs a photographer'),sub:pair('تصوير فيديو · اليوم 13:00','Video coverage · today 13:00'),status:pair('ناقص تكليف','Unassigned'),tone:'bad'},
 {id:'DEMO-R-02',for:['90002','90003'],kind:'request',icon:'orders',title:pair('طلب تغطية تجريبي جديد','New demo coverage request'),sub:pair('جهة تجريبية · غداً 09:00','Demo unit · tomorrow 09:00'),status:pair('طلب جديد','New request'),tone:'warn'},
 {id:'DEMO-S-01',for:['90002','90003'],kind:'swap',icon:'swap',title:pair('طلب تبديل تجريبي','Demo swap request'),sub:pair('مصور تجريبي 1 · مناوبة الغد','Demo Photographer 1 · tomorrow’s duty'),status:pair('بانتظار المراجعة','Awaiting review'),tone:'warn'},
 {id:'DEMO-A-01',for:['90004'],kind:'approval',icon:'check',title:pair('اعتماد تغطية تجريبية','Demo coverage approval'),sub:pair('مدير الفرع ← رئيس القسم ← مدير الإدارة','Branch manager → Section head → Director'),status:pair('بانتظار موافقتك','Awaiting your approval'),tone:'warn'},
 {id:'DEMO-A-02',for:['90004'],kind:'approval',icon:'orders',title:pair('تقرير يومي تجريبي','Demo daily report'),sub:pair('ملخص أعمال فرع التصوير','Photography branch activity summary'),status:pair('للاطلاع','For review'),tone:'info'},
 {id:'DEMO-P-02',for:['90005'],kind:'programme',icon:'calendar',title:pair('برنامج تجريبي يحتاج متابعة','Demo programme needs follow-up'),sub:pair('دعوات بانتظار الرد · غداً 08:00','Invitations awaiting response · tomorrow 08:00'),status:pair('يحتاج متابعتك','Needs follow-up'),tone:'warn'},
 {id:'DEMO-R-01',for:['90006'],kind:'request',icon:'orders',title:pair('طلب تغطية تجريبي','Demo coverage request'),sub:pair('قاعة تجريبية · غداً 09:00','Demo hall · tomorrow 09:00'),status:pair('قيد المراجعة','Under review'),tone:'info'}
];
export default {
 schema:'a1-demo-1', defaults:{role:'ph',lang:'ar',theme:'auto'},languages:['ar','en'],themes:['auto','light','dark'],
 limits:{homeWaiting:3,searchResults:12,navigationTargetMs:300},
 date:'2026-11-04T08:00:00+04:00',timeZone:'Asia/Dubai',roles,services,people,items,
 focal:{time:pair('09:00','09:00'),end:pair('حتى 11:00','Until 11:00'),place:pair('قاعة تجريبية','Demo hall'),unit:pair('جهة تجريبية','Demo unit')},
 kpis:{
 ph:[{service:'tasks',value:2,label:pair('مهام اليوم','tasks today'),sub:pair('1 بانتظار الرد · 1 مقبولة','1 awaiting response · 1 accepted')},{service:'alerts',value:1,label:pair('تنويه جديد','new notice'),sub:pair('للاطلاع فقط','For review only')}],
 lead:[{service:'orders',value:4,label:pair('طلبات اليوم','orders today'),sub:pair('1 ناقص تكليف · 2 جديدة','1 unassigned · 2 new')},{service:'periods',value:2,label:pair('برامج جارية','active programmes'),sub:pair('بيانات تجريبية','Demo data')}],
 sup:[{service:'orders',value:4,label:pair('طلبات اليوم','orders today'),sub:pair('1 ناقص تكليف · 2 جديدة','1 unassigned · 2 new')},{service:'productivity',value:92,label:pair('٪ في الموعد','% on time'),sub:pair('مؤشر تجريبي','Demo indicator')}],
 dir:[{service:'indicators',value:4,label:pair('طلبات اليوم','orders today'),sub:pair('فرع التصوير','Photography branch')},{service:'projects',value:2,label:pair('اعتمادات بانتظارك','pending approvals'),sub:pair('بيانات تجريبية','Demo data')}],
 prog:[{service:'programmes',value:2,label:pair('برامج جارية','active programmes'),sub:pair('برنامج يحتاج متابعة','1 programme needs follow-up')},{service:'availability',value:1,label:pair('دعوة بانتظار الرد','pending invitation'),sub:pair('مصور تجريبي 1','Demo Photographer 1')}],
 req:[{service:'myrequests',value:1,label:pair('طلب جارٍ','active request'),sub:pair('قيد المراجعة','Under review')},{service:'alerts',value:0,label:pair('تنبيهات جديدة','new alerts'),sub:pair('لا توجد تنبيهات','No alerts')}]
 },
 copy:{
 app:pair('الإعلام الأمني','Security Media'),org:pair('فرع التصوير · إدارة الإعلام الأمني','Photography branch · Security Media'),
 demo:pair('عرض فقط · بيانات DEMO','View only · DEMO data'),demoTitle:pair('مراجعة الهيكل A-1','A-1 structure review'),
 role:pair('دور العرض التجريبي','Demo display role'),language:pair('اللغة','Language'),theme:pair('المظهر','Appearance'),
 auto:pair('تلقائي','System'),light:pair('فاتح','Light'),dark:pair('داكن','Dark'),
 greeting:pair('صباح الخير، ','Good morning, '),home:pair('الرئيسية','Home'),waiting:pair('بانتظارك','Waiting for you'),
 all:pair('الكل','All'),shortcuts:pair('اختصاراتك','Your shortcuts'),services:pair('خدماتك','Your services'),
 search:pair('ابحث: خدمة، طلب، شخص','Search: service, order, person'),searchTitle:pair('البحث','Search'),
 searchHint:pair('ابحث في بيانات العرض التجريبي','Search the demo data'),noResults:pair('لا توجد نتائج','No results'),
 service:pair('خدمة','Service'),open:pair('عرض','View'),back:pair('رجوع','Back'),close:pair('إغلاق','Close'),
 later:pair('تتوفر هذه الصفحة في مرحلة لاحقة.','This page is planned for a later phase.'),
 readOnly:pair('هذه المرحلة للعرض فقط. لا تُرسل طلبات ولا تُغيّر بيانات.','This phase is view only. No requests are sent and no records are changed.'),
 urgent:pair('الأهم الآن','Most urgent'),next:pair('مهمتك القادمة','Your next task'),
 empty:pair('لا شيء ينتظرك','Nothing waiting'),done:pair('أنجزت كل شيء.','All done.'),
 cached:pair('بيانات DEMO محفوظة على الجهاز','DEMO data saved on this device'),bundled:pair('بيانات DEMO مضمّنة','Bundled DEMO data'),
 networkOff:pair('دون اتصال · بيانات DEMO','Offline · DEMO data'),mil:pair('الرقم التجريبي','Demo number'),
 controls:pair('خيارات العرض','Display options'),count:pair('عناصر','items')
 }
};
