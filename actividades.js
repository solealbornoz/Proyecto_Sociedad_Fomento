// Datos de ejemplo: la sociedad de fomento puede ajustar categorías, horarios y valores.
const actividades = [
  { id:'futbol', nombre:'Fútbol', icono:'⚽', descripcion:'Entrenamiento y juego en equipo para cada edad.', precio:6000, categorias:[['Infantil (6 a 12 años)',1,'17:00'],['Juvenil (13 a 17 años)',3,'18:00'],['Adultos (18 años o más)',5,'19:00']] },
  { id:'patin', nombre:'Patín', icono:'🛼', descripcion:'Aprendizaje y práctica sobre ruedas.', precio:6500, categorias:[['Inicial',1,'16:00'],['Intermedio',3,'16:00'],['Avanzado',5,'16:00'],['Todas las edades',6,'10:00']] },
  { id:'taekwondo', nombre:'Taekwondo', icono:'🥋', descripcion:'Movimiento, disciplina y aprendizaje compartido.', precio:6000, categorias:[['Infantil',2,'17:00'],['Juvenil',4,'18:00'],['Adultos',6,'11:00']] },
  { id:'gimnasia', nombre:'Gimnasia artística', icono:'🤸', descripcion:'Coordinación, movimiento y expresión corporal.', precio:6500, categorias:[['Infantil',1,'15:00'],['Juvenil',3,'17:00']] },
  { id:'funcional', nombre:'Funcional', icono:'🏋️', descripcion:'Entrenamiento adaptado a distintos niveles.', precio:5000, categorias:[['Adultos',2,'19:00'],['Todas las edades',4,'19:00']] },
  { id:'basquet', nombre:'Básquet', icono:'🏀', descripcion:'Deporte, equipo y encuentros en el barrio.', precio:6000, categorias:[['Infantil',2,'16:00'],['Juvenil',4,'17:00'],['Adultos',5,'20:00']] },
  { id:'danza', nombre:'Danza', icono:'💃', descripcion:'Un espacio para expresarse a través del movimiento.', precio:5500, categorias:[['Infantil',1,'18:00'],['Juvenil',3,'19:00'],['Adultos',6,'15:00']] }
];
module.exports = actividades;
