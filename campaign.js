(function(root){'use strict';
const worlds=[
 {name:'Орбита Земли',code:'TERRA',color:'#69d8ef',shade:'rgba(5,32,60,.36)',planet:['#89b8cf','#305c7f','#08172e'],style:'orbit',story:'Последний свободный порт ждёт подкрепление.'},
 {name:'Рубеж Марса',code:'ARES',color:'#ffab75',shade:'rgba(70,19,13,.44)',planet:['#d89764','#803c36','#241327'],style:'dust',story:'Враг перекрыл транспортные коридоры Марса.'},
 {name:'Ледяной пояс',code:'BOREAL',color:'#9feeff',shade:'rgba(12,42,57,.46)',planet:['#d3eef2','#4c8197','#112431'],style:'ice',story:'Скрытая эскадра прячется в ледяном тумане.'},
 {name:'Туманность Вега',code:'VEGA',color:'#c5a1ff',shade:'rgba(50,15,78,.46)',planet:['#a993cd','#5d397b','#1b1537'],style:'nebula',story:'Сигнал командира теряется среди теневых флотов.'},
 {name:'Грозовой фронт',code:'TEMPEST',color:'#a4f5ad',shade:'rgba(10,52,34,.48)',planet:['#acd5a5','#3c7564','#0a252b'],style:'storm',story:'Ионные бури питают защитные установки врага.'},
 {name:'Сердце Улья',code:'NEMESIS',color:'#ffd684',shade:'rgba(58,34,13,.43)',planet:['#dbc284','#8c604c','#241a31'],style:'hive',story:'Источник вторжения близко. Флот прикрывает ядро.'}
];
const names=[['Первый контакт','Крылья тревоги','Разорвать строй','Линия обороны','Страж орбиты'],['Красная пыль','Охота на конвой','Штурм рубежа','Стальные ворота','Титан Марса'],['Холодный след','Ледяные клинья','Разведка боем','Белый перехват','Архонт льда'],['Тихая частота','Призрачный строй','Танец охотников','Теневая армада','Глаз Веги'],['Ионный след','Разрядный коридор','Зелёный фронт','Сердце бури','Повелитель гроз'],['Порог Улья','Золотой конвой','Защитники ядра','Последняя эскадра','Немезида']];
const styles=['patrol','wedge','crossfire','armada','siege'];
const missions=names.flatMap((group,world)=>group.map((name,slot)=>({id:world*5+slot+1,world,slot,name,duration:54+world*7+slot*8,formation:styles[(slot+world)%5],objective:slot===1||slot===3?'salvage':slot===2?'elite':'destroy',target:slot===1||slot===3?5+world:slot===2?2+Math.floor(world/2):12+world*3,eliteRate:.08+world*.035+(slot===2?.14:0),spawn:.95-slot*.035-world*.025,boss:world*5+slot,brief:worlds[world].story})));
// Each mission has its own commander, silhouette kit, movement and attack order.
const bossCatalog=[
 ['lyra','Капитан Лира','#77e3ff',['fan','aim'],'sway','Веер лазеров и один прицельный залп.'],
 ['kestrel','Перехватчик Кестрел','#ab94ff',['needles','fan','aim'],'figure8','Скоростные иглы и широкие крылья перехвата.'],
 ['talon','Страж Коготь','#9cf4df',['sweep','aim','fan'],'pendulum','Рассекает сектор проходящими залпами.'],
 ['aegis','Бастион Эгида','#efc384',['cross','fan','needles'],'steps','Двойные батареи создают перекрёстный огонь.'],
 ['orion','Адмирал Орион','#79b6ff',['lanes','cross','aim','fan'],'orbit','Подсвечивает коридоры перед тяжёлым разрядом.'],
 ['cinder','Корсар Пепел','#ff9e79',['ring','aim','sweep'],'sway','Полукольца огня перекрывают прямую траекторию.'],
 ['scarab','Скарабей Марса','#ffc373',['wings','needles','ring'],'lunge','Выпускает клещи огня с крайних орудий.'],
 ['vulkan','Кузнец Вулкан','#ff786f',['rake','fan','lanes','aim'],'figure8','Чередует решётку с прицельными тяжёлыми снарядами.'],
 ['anvil','Крейсер Наковальня','#e8b395',['cross','ring','barrage','lanes'],'steps','Батареи на броневых плитах стреляют сериями.'],
 ['titan','Маршал Титан','#ffbf88',['lanes','rake','minions','ring','aim'],'pendulum','Вызывает охрану и закрывает узкие коридоры.'],
 ['frost','Охотник Иней','#b6f7ff',['needles','wings','aim','sweep'],'orbit','Холодные крылья дают быстрые прицельные очереди.'],
 ['glacier','Ледник Криос','#b8d2ff',['ring','rake','lanes','cross'],'sway','Ледяная броня выдерживает продолжительный обстрел.'],
 ['shard','Смотритель Осколок','#9ff0e4',['sweep','needles','barrage','ring'],'lunge','Резко меняет позицию, сохраняя предупреждение атак.'],
 ['aurora','Страж Аврора','#d5b6ff',['wings','spiral','lanes','aim'],'figure8','Спирали сходятся с залпами боковых батарей.'],
 ['boreas','Архонт Борей','#c9fbff',['minions','cross','ring','rake','lanes'],'steps','Элитный конвой прикрывает ледяного архонта.'],
 ['echo','Призрак Эхо','#cc9eff',['spiral','aim','needles','sweep'],'pendulum','Рисует вращающийся веер и охотится по следу ракеты.'],
 ['mirage','Мираж Селена','#f0b6ff',['wings','rake','spiral','lanes'],'orbit','Крылья и вращающиеся батареи меняют безопасные окна.'],
 ['wraith','Теневой Рейвен','#a3a9ff',['barrage','cross','sweep','minions'],'lunge','Теневая охрана входит с двух сторон.'],
 ['iris','Оракул Ирис','#e1a0df',['lattice','ring','aim','spiral'],'figure8','Световая решётка оставляет один свободный проход.'],
 ['vega','Всевидящая Вега','#c4b2ff',['lanes','minions','lattice','wings','barrage'],'steps','Смена фаз ускоряет лучи и приближение охраны.'],
 ['spark','Разряд Искра','#b3ffb8',['needles','sweep','nova','aim'],'sway','Светящиеся импульсы раскрываются в несколько волн.'],
 ['ion','Проводник Ион','#84efd1',['lanes','cross','barrage','rake'],'pendulum','Заряженные коридоры чередуются с двойными батареями.'],
 ['cyclone','Командор Циклон','#d0ff91',['spiral','wings','minions','nova'],'orbit','Вращает строй и отправляет стремительные звенья.'],
 ['fulgur','Хранитель Фульгур','#91ffb6',['lattice','needles','ring','barrage','sweep'],'lunge','Пять режимов батарей проверяют скорость уклонения.'],
 ['tempest','Повелитель Гром','#c4f9a3',['nova','lanes','cross','minions','lattice','aim'],'figure8','После второй фазы вскрывает все грозовые батареи.'],
 ['chrysalis','Матка Хризалида','#ffd4a2',['wings','minions','rake','spiral','ring'],'steps','Панцирь улья выпускает многочисленные боевые звенья.'],
 ['mantis','Генерал Мантис','#ffd985',['cross','barrage','lattice','needles','nova'],'pendulum','Серповые батареи перекрывают края экрана.'],
 ['obelisk','Обелиск Ядра','#f0b989',['rake','lanes','ring','minions','sweep','aim'],'orbit','Броневые башни чередуют разряды с охраной ядра.'],
 ['sovereign','Император Астер','#ffab93',['lattice','spiral','wings','nova','barrage','cross'],'lunge','Три фазы раскрывают кольца и батареи флагмана.'],
 ['nemesis','Королева Немезида','#ffe3a0',['minions','nova','lanes','lattice','spiral','cross','barrage'],'figure8','Последняя королева. Три фазы, охрана и смена безопасных окон.']
];
const shapeNames=['серп','стрела','клешни','цитадель','ореол'];
const bossTypes=bossCatalog.map(([id,title,c,patterns,movementKind,description],i)=>({
 id,stage:i+1,artIndex:i,name:title.toUpperCase(),title,description,c,accent:['#c6f5ff','#ffdf96','#c2ffff','#f5b9ff','#d6ff8f','#fff1c4'][Math.floor(i/5)],
 r:58+Math.floor(i/5)*3+(i%5===3?5:0),hp:Math.round(120+i*10+i*i*.19),kind:['guardian','dreadnought','archon','eye','tempest','mothership'][Math.floor(i/5)],
 shape:shapeNames[i%5]+'-'+(Math.floor(i/5)+1),shapeVariant:i%5,armorTier:Math.floor(i/5)+1,patterns,
 sprite:[1,2,3,4,0][i%5],speed:140+i*2.4,interval:2.95-i*.032,telegraph:Math.max(.82,1.08-i*.008),density:5+Math.floor(i/3),
 movement:{id:id+'-flight',kind:movementKind,amplitude:.17+(i%5)*.015,frequency:.53+i*.018,depth:5+Math.floor(i/5)*1.5,phase:(i%5)*.63},
 phases:i>=15?3:2
}));
const weaponGrades=[
 {rank:1,name:'Импульс',color:'#93d8ee',description:'Базовый режим: точный лазер, тройной веер, ядро плазмы, электрический заряд или ионный луч.'},
 {rank:2,name:'Двойной заряд',color:'#8ff1b1',description:'Парные стволы, широкий веер, усиленная плазма, разряд между двумя целями и более длинный луч.'},
 {rank:3,name:'Перегрузка',color:'#aeadff',description:'Три лазера, пробивной веер, парные плазменные ядра, цепь из трёх электрических ударов и двойной луч.'},
 {rank:4,name:'Штурм',color:'#ffc47f',description:'Четыре пробивных лазера, плотный веер, плазма с осколками, цепной разряд по четырём целям и двойные ионные батареи.'},
 {rank:5,name:'Сверхновая',color:'#ffe6a0',description:'Пятерной лазер, рикошетный веер, тройная плазма с осколками, два заряда Теслы с цепями по пять целей и три широких луча.'}
];
const upgrades={hull:{name:'Корпус',text:'Дополнительная жизнь на уровнях 2 и 4.',base:150,max:4},reactor:{name:'Реактор',text:'Каждый уровень повышает урон оружия на 8%.',base:170,max:5},magnet:{name:'Магнит',text:'Капсулы и сплав притягиваются с большего расстояния.',base:120,max:5},shield:{name:'Энергощит',text:'Защита на старте и больше времени от капсулы щита.',base:140,max:4},wingman:{name:'Ведомый',text:'Боевой дрон прикрывает ракету собственным лазером.',base:250,max:4},salvage:{name:'Сканер',text:'Больше сплава за завершённую миссию.',base:130,max:4}};
const ships=[{id:'pioneer',name:'Пионер',tag:'БАЛАНС',cost:0,unlock:1,text:'Надёжная ракета. Универсальный выбор для кампании.'},{id:'swift',name:'Стриж',tag:'СКОРОСТЬ',cost:700,unlock:6,text:'На 25% быстрее движение. Быстрее уклонение и перехват капсул.'},{id:'bastion',name:'Бастион',tag:'БРОНЯ',cost:1100,unlock:11,text:'Дополнительная жизнь и щит на старте. Скорость ниже на 12%.'}];
const key='imranStarDefender.v3';
const number=(value,min,max)=>Math.max(min,Math.min(max,Math.floor(Number(value)||0)));
function defaults(){return {version:3,credits:0,unlocked:1,selected:1,missions:{},upgrades:Object.fromEntries(Object.keys(upgrades).map(k=>[k,0])),arsenal:{laser:true,spread:false,plasma:false,arc:false,beam:false},weaponLevels:{laser:1,spread:0,plasma:0,arc:0,beam:0},ships:['pioneer'],ship:'pioneer',endlessBest:0,settings:{sound:false,music:true,autoFire:true,reducedMotion:false,vibration:true,difficulty:'normal'}}}
function sanitize(raw){const state=defaults();if(!raw||typeof raw!=='object')return state;state.credits=number(raw.credits,0,9999999);state.unlocked=number(raw.unlocked,1,30);state.selected=number(raw.selected,1,state.unlocked);state.endlessBest=number(raw.endlessBest,0,99999999);for(const k of Object.keys(upgrades))state.upgrades[k]=number(raw.upgrades?.[k],0,upgrades[k].max);for(const k of Object.keys(state.arsenal)){const legacy=k==='arc'&&raw.arsenal?.rockets===true;if(k!=='laser')state.arsenal[k]=raw.arsenal?.[k]===true||legacy;const rank=k==='arc'?Math.max(Number(raw.weaponLevels?.arc)||0,legacy?Number(raw.weaponLevels?.rockets)||1:0):raw.weaponLevels?.[k];state.weaponLevels[k]=state.arsenal[k]?number(rank||1,1,5):0;}for(const ship of ships.slice(1))if(Array.isArray(raw.ships)&&raw.ships.includes(ship.id))state.ships.push(ship.id);if(state.ships.includes(raw.ship))state.ship=raw.ship;for(const k of ['sound','music','autoFire','reducedMotion','vibration'])if(typeof raw.settings?.[k]==='boolean')state.settings[k]=raw.settings[k];if(['easy','normal','hard'].includes(raw.settings?.difficulty))state.settings.difficulty=raw.settings.difficulty;for(const m of missions){const value=raw.missions?.[m.id];if(value&&typeof value==='object'&&number(value.stars,0,3)>0)state.missions[m.id]={stars:number(value.stars,1,3),score:number(value.score,0,99999999),clears:number(value.clears,1,999999)};}let contiguous=1;while(contiguous<30&&state.missions[contiguous])contiguous++;state.unlocked=contiguous;state.selected=Math.min(state.selected,contiguous);return state}
function createProfile(storage){let state=defaults(),storageAvailable=true;try{state=sanitize(JSON.parse(storage?.getItem(key)||'null'));}catch(error){storageAvailable=false}function save(){try{if(!storage)throw Error('Unavailable');storage.setItem(key,JSON.stringify(state));storageAvailable=true;return true}catch(error){storageAvailable=false;return false}}
return {get state(){return state},get storageAvailable(){return storageAvailable},save,select(id){id=number(id,1,30);if(id>state.unlocked)return false;state.selected=id;save();return true},setting(name,value){if(!Object.hasOwn(state.settings,name))return false;if(name==='difficulty'){if(!['easy','normal','hard'].includes(value))return false}else if(typeof value!=='boolean')return false;state.settings[name]=value;save();return true},unlockWeapon(type){if(!Object.hasOwn(state.arsenal,type)||state.arsenal[type])return false;state.arsenal[type]=true;state.weaponLevels[type]=Math.max(1,state.weaponLevels[type]||0);save();return true},improveWeapon(type){if(!Object.hasOwn(state.arsenal,type))return false;state.arsenal[type]=true;state.weaponLevels[type]=Math.min(5,(state.weaponLevels[type]||0)+1);save();return state.weaponLevels[type]},cost(type){const u=Object.hasOwn(upgrades,type)?upgrades[type]:null;return u?Math.round(u.base*Math.pow(1.65,state.upgrades[type])):Infinity},buy(type){const u=Object.hasOwn(upgrades,type)?upgrades[type]:null,cost=this.cost(type);if(!u||state.upgrades[type]>=u.max||state.credits<cost)return false;state.credits-=cost;state.upgrades[type]++;save();return true},selectShip(id){const ship=ships.find(s=>s.id===id);if(!ship)return false;if(!state.ships.includes(id)){if(state.unlocked<ship.unlock||state.credits<ship.cost)return false;state.credits-=ship.cost;state.ships.push(id);}state.ship=id;save();return true},award(id,stats){const m=missions[id-1];if(!m||id>state.unlocked)return null;const bonus=m.objective==='salvage'?stats.salvage>=m.target:m.objective==='elite'?stats.elites>=m.target:stats.kills>=m.target;const stars=1+Number(bonus)+Number(stats.damage===0),previous=state.missions[id],credits=Math.round((110+m.world*40+m.slot*15+number(stats.kills,0,1000)*3+number(stats.salvage,0,1000)*12+stars*25)*(1+state.upgrades.salvage*.12));state.missions[id]={stars:Math.max(stars,previous?.stars||0),score:Math.max(number(stats.score,0,99999999),previous?.score||0),clears:(previous?.clears||0)+1};state.unlocked=Math.max(state.unlocked,Math.min(30,id+1));state.selected=state.unlocked;state.credits=Math.min(9999999,state.credits+credits);save();return {stars,credits,bonus,complete:id===30}},awardEndless(score,kills){state.endlessBest=Math.max(state.endlessBest,number(score,0,99999999));const credits=Math.round(number(kills,0,5000)*4);state.credits=Math.min(9999999,state.credits+credits);save();return credits},reset(){state=defaults();save();}}}
function mission(id){return missions[number(id,1,30)-1]}
function goalText(m){return m.objective==='salvage'?'Собрать сплав: '+m.target:m.objective==='elite'?'Уничтожить элиту: '+m.target:'Уничтожить корабли: '+m.target}
const api={worlds,missions,bossTypes,weaponGrades,upgrades,ships,createProfile,sanitize,mission,goalText,key};
if(typeof module==='object'&&module.exports)module.exports=api;else{root.ImranCampaign=api;let storage;try{storage=root.localStorage}catch(error){}api.profile=createProfile(storage)}
})(typeof globalThis!=='undefined'?globalThis:this);
