extends Node
## Глобальное состояние матча (автозагрузка GameState).
## На первом этапе — только реестр персонажей и базовые сигналы;
## раунды, бомба и экономика добавляются на этапе 5.

enum Team { T, CT }

## Кто-то кого-то убил (для killfeed и статистики).
signal kill_happened(attacker: Node, victim: Node, weapon_id: String, headshot: bool)

## Все живые участники матча (игрок и боты).
var characters: Array = []


func register_character(ch: Node) -> void:
	if not characters.has(ch):
		characters.append(ch)


func unregister_character(ch: Node) -> void:
	characters.erase(ch)


func get_team_name(team: int) -> String:
	return "Террористы" if team == Team.T else "Спецназ"


## Живые персонажи команды.
func get_alive(team: int) -> Array:
	var result: Array = []
	for ch in characters:
		if is_instance_valid(ch) and ch.alive and ch.team == team:
			result.append(ch)
	return result


## Живые противники указанной команды.
func get_alive_enemies(team: int) -> Array:
	return get_alive(Team.CT if team == Team.T else Team.T)
