class_name WeaponDB
## Статическая база данных оружия.
## slot: 1 — основное, 2 — пистолет, 3 — нож.
## team: "" — доступно всем, "T"/"CT" — только этой команде.

const DB := {
	"knife": {
		"name": "Нож", "slot": 3, "price": 0, "damage": 45, "fire_rate": 1.6,
		"mag": -1, "reserve": 0, "reload": 0.0, "spread": 0.0, "range": 2.2,
		"auto": false, "recoil": 0.0, "kill_reward": 1500, "team": "",
		"color": Color(0.7, 0.7, 0.75),
	},
	"glock": {
		"name": "Glock-18", "slot": 2, "price": 200, "damage": 28, "fire_rate": 6.5,
		"mag": 20, "reserve": 120, "reload": 2.2, "spread": 0.7, "range": 300.0,
		"auto": false, "recoil": 0.7, "kill_reward": 300, "team": "T",
		"color": Color(0.25, 0.25, 0.28),
	},
	"usp": {
		"name": "USP-S", "slot": 2, "price": 200, "damage": 33, "fire_rate": 5.9,
		"mag": 12, "reserve": 100, "reload": 2.2, "spread": 0.6, "range": 300.0,
		"auto": false, "recoil": 0.8, "kill_reward": 300, "team": "CT",
		"color": Color(0.2, 0.2, 0.22),
	},
	"deagle": {
		"name": "Desert Eagle", "slot": 2, "price": 700, "damage": 55, "fire_rate": 3.3,
		"mag": 7, "reserve": 35, "reload": 2.3, "spread": 0.9, "range": 300.0,
		"auto": false, "recoil": 1.8, "kill_reward": 300, "team": "",
		"color": Color(0.55, 0.52, 0.4),
	},
	"mp5": {
		"name": "MP5-SD", "slot": 1, "price": 1500, "damage": 26, "fire_rate": 12.5,
		"mag": 30, "reserve": 120, "reload": 2.6, "spread": 1.1, "range": 300.0,
		"auto": true, "recoil": 0.5, "kill_reward": 600, "team": "",
		"color": Color(0.15, 0.15, 0.18),
	},
	"ak47": {
		"name": "AK-47", "slot": 1, "price": 2700, "damage": 36, "fire_rate": 10.0,
		"mag": 30, "reserve": 90, "reload": 2.5, "spread": 0.9, "range": 300.0,
		"auto": true, "recoil": 1.1, "kill_reward": 300, "team": "T",
		"color": Color(0.45, 0.28, 0.12),
	},
	"m4a1": {
		"name": "M4A1-S", "slot": 1, "price": 3100, "damage": 33, "fire_rate": 10.9,
		"mag": 30, "reserve": 90, "reload": 2.5, "spread": 0.8, "range": 300.0,
		"auto": true, "recoil": 0.9, "kill_reward": 300, "team": "CT",
		"color": Color(0.3, 0.32, 0.3),
	},
	"awp": {
		"name": "AWP", "slot": 1, "price": 4750, "damage": 115, "fire_rate": 0.85,
		"mag": 10, "reserve": 30, "reload": 3.6, "spread": 0.05, "range": 500.0,
		"auto": false, "recoil": 3.0, "kill_reward": 100, "team": "",
		"color": Color(0.15, 0.3, 0.15),
	},
}


static func data(id: String) -> Dictionary:
	return DB[id]


## Стартовый пистолет команды.
static func default_pistol(team: int) -> String:
	return "glock" if team == GameState.Team.T else "usp"


## Список покупаемого оружия для команды (для меню и ботов).
static func buyable(team: int) -> Array[String]:
	var team_name := "T" if team == GameState.Team.T else "CT"
	var result: Array[String] = []
	for id in DB:
		var d: Dictionary = DB[id]
		if d.price > 0 and (d.team == "" or d.team == team_name):
			result.append(id)
	return result
