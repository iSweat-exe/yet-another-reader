//! What the player is holding down, as osu!lazer itself sees it.
//!
//! The game keeps the pressed keyboard keys and mouse buttons in the framework's `InputState`
//! (`ButtonStates<Key>` / `ButtonStates<MouseButton>`, each a `HashSet` of enum values). Reading
//! them is a handful of pointer reads, cheap enough to do hundreds of times per second, and it is
//! the game's own view: a key the game ignores (another window focused) is not reported.
//!
//! A replay presses the ruleset's actions without touching the keyboard, so those are read too
//! (`pressedActions`) and turned back into the keys the player bound to them. While a replay
//! runs, only those are reported: the player's own keys do nothing in the game.

use serde::Serialize;

/// The keys and mouse buttons held down at one instant. Names are stable and sorted.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputState {
    /// Keyboard keys held (`"Z"`, `"X"`, `"ShiftLeft"`, `"Space"`…), in the order of `osuTK.Input.Key`.
    pub keys: Vec<String>,
    /// Mouse buttons held (`"Left"`, `"Right"`, `"Middle"`, `"Button1"`, `"Button2"`…).
    pub mouse: Vec<String>,
}

/// The keys and mouse buttons of one key binding.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Binding {
    pub keys: Vec<String>,
    pub mouse: Vec<String>,
}

impl InputState {
    /// Builds the state from the raw enum values read from the game.
    #[must_use]
    pub fn from_codes(mut keys: Vec<i32>, mut mouse: Vec<i32>) -> Self {
        keys.sort_unstable();
        keys.dedup();
        mouse.sort_unstable();
        mouse.dedup();
        Self {
            keys: keys.into_iter().map(key_name).collect(),
            mouse: mouse.into_iter().map(mouse_name).collect(),
        }
    }

    /// Adds what the game's pressed actions stand for. `actions` gives, for each pressed action,
    /// the inputs of all its bindings, preferred one first. An action none of whose bindings is
    /// physically held is a replay (or another device) pressing it: its first binding is shown as
    /// held. An action held for real adds nothing, so a second binding does not light up too.
    #[must_use]
    pub fn with_actions<'a>(mut self, actions: impl IntoIterator<Item = &'a [Binding]>) -> Self {
        let mut added = false;
        for bindings in actions {
            let held = bindings.iter().any(|b| {
                b.keys.iter().any(|k| self.keys.contains(k))
                    || b.mouse.iter().any(|m| self.mouse.contains(m))
            });
            if let (false, Some(first)) = (held, bindings.first()) {
                self.keys.extend_from_slice(&first.keys);
                self.mouse.extend_from_slice(&first.mouse);
                added = true;
            }
        }
        if added {
            self.keys.sort_unstable();
            self.keys.dedup();
            self.mouse.sort_unstable();
            self.mouse.dedup();
        }
        self
    }

    /// Whether nothing is held.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.keys.is_empty() && self.mouse.is_empty()
    }
}

/// Name of an `osuTK.Input.Key` value. Unknown values give `Key<n>` so nothing is silently lost.
#[must_use]
pub fn key_name(code: i32) -> String {
    const SIMPLE: &[(i32, &str)] = &[
        (1, "ShiftLeft"),
        (2, "ShiftRight"),
        (3, "ControlLeft"),
        (4, "ControlRight"),
        (5, "AltLeft"),
        (6, "AltRight"),
        (7, "WinLeft"),
        (8, "WinRight"),
        (9, "Menu"),
        (45, "Up"),
        (46, "Down"),
        (47, "Left"),
        (48, "Right"),
        (49, "Enter"),
        (50, "Escape"),
        (51, "Space"),
        (52, "Tab"),
        (53, "BackSpace"),
        (54, "Insert"),
        (55, "Delete"),
        (56, "PageUp"),
        (57, "PageDown"),
        (58, "Home"),
        (59, "End"),
        (60, "CapsLock"),
        (61, "ScrollLock"),
        (62, "PrintScreen"),
        (63, "Pause"),
        (64, "NumLock"),
        (65, "Clear"),
        (66, "Sleep"),
        (77, "KeypadDivide"),
        (78, "KeypadMultiply"),
        (79, "KeypadSubtract"),
        (80, "KeypadAdd"),
        (81, "KeypadDecimal"),
        (82, "KeypadEnter"),
        (119, "Tilde"),
        (120, "Minus"),
        (121, "Plus"),
        (122, "BracketLeft"),
        (123, "BracketRight"),
        (124, "Semicolon"),
        (125, "Quote"),
        (126, "Comma"),
        (127, "Period"),
        (128, "Slash"),
        (129, "BackSlash"),
        (130, "NonUSBackSlash"),
    ];
    if let Some((_, name)) = SIMPLE.iter().find(|(c, _)| *c == code) {
        return (*name).to_owned();
    }
    match code {
        10..=44 => format!("F{}", code - 9),
        67..=76 => format!("Keypad{}", code - 67),
        83..=108 => char::from(b'A' + (code - 83) as u8).to_string(),
        109..=118 => format!("Number{}", code - 109),
        other => format!("Key{other}"),
    }
}

/// The keys and mouse buttons of a lazer key binding (`KeyCombinationString`, e.g. `"108"` or
/// `"1,83"`), in the same names as [`InputState`]. The numbers are `InputKey` values, which match
/// `osuTK.Input.Key` for letters, digits and function keys; modifiers and mouse buttons differ.
/// Codes that mean nothing here (joystick, MIDI, tablet…) are left out.
#[must_use]
pub fn binding_inputs(combination: &str) -> (Vec<String>, Vec<String>) {
    let (mut keys, mut mouse) = (Vec::new(), Vec::new());
    for code in combination
        .split(',')
        .filter_map(|c| c.trim().parse::<i32>().ok())
    {
        match code {
            1 => keys.push("ShiftLeft".to_owned()),
            2 => keys.push("ControlLeft".to_owned()),
            3 => keys.push("AltLeft".to_owned()),
            4 => keys.push("WinLeft".to_owned()),
            10..=999 => keys.push(key_name(code)),
            // MouseLeft, MouseRight, MouseMiddle, MouseButton1…
            1000 => mouse.push(mouse_name(0)),
            1001 => mouse.push(mouse_name(2)),
            1002 => mouse.push(mouse_name(1)),
            1003..=1010 => mouse.push(mouse_name(code - 1000)),
            _ => {}
        }
    }
    (keys, mouse)
}

/// Name of an `osuTK.Input.MouseButton` value.
#[must_use]
pub fn mouse_name(code: i32) -> String {
    match code {
        0 => "Left".to_owned(),
        1 => "Middle".to_owned(),
        2 => "Right".to_owned(),
        3..=11 => format!("Button{}", code - 2),
        other => format!("Mouse{other}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_name_should_name_letters_digits_and_function_keys() {
        assert_eq!(key_name(83), "A");
        assert_eq!(key_name(108), "Z");
        assert_eq!(key_name(109), "Number0");
        assert_eq!(key_name(10), "F1");
        assert_eq!(key_name(67), "Keypad0");
        assert_eq!(key_name(51), "Space");
        assert_eq!(key_name(1), "ShiftLeft");
    }

    #[test]
    fn key_name_should_keep_unknown_codes_visible() {
        assert_eq!(key_name(999), "Key999");
        assert_eq!(key_name(0), "Key0");
    }

    #[test]
    fn mouse_name_should_name_the_buttons() {
        assert_eq!(mouse_name(0), "Left");
        assert_eq!(mouse_name(2), "Right");
        assert_eq!(mouse_name(3), "Button1");
        assert_eq!(mouse_name(4), "Button2");
    }

    #[test]
    fn binding_inputs_should_name_keys_and_mouse_buttons() {
        assert_eq!(binding_inputs("108"), (vec!["Z".to_owned()], vec![]));
        assert_eq!(
            binding_inputs("1,83"),
            (vec!["ShiftLeft".to_owned(), "A".to_owned()], vec![])
        );
        assert_eq!(binding_inputs("1001"), (vec![], vec!["Right".to_owned()]));
        assert_eq!(binding_inputs("junk,1200"), (vec![], vec![]));
    }

    #[test]
    fn with_actions_should_light_the_keys_of_a_replayed_action_only() {
        let bind = |k: &str| Binding {
            keys: vec![k.to_owned()],
            mouse: vec![],
        };
        let left = [bind("Z"), bind("A")];
        let right = [bind("X")];
        // Nothing held (a replay): the first binding shows up.
        let replay = InputState::default().with_actions([&left[..]]);
        assert_eq!(replay.keys, ["Z"]);
        // The second binding held for real: the action adds nothing, X is replayed.
        let live = InputState::from_codes(vec![83], vec![]).with_actions([&left[..], &right[..]]);
        assert_eq!(live.keys, ["A", "X"]);
    }

    #[test]
    fn from_codes_should_sort_and_deduplicate() {
        let state = InputState::from_codes(vec![108, 83, 83], vec![2, 0]);
        assert_eq!(state.keys, ["A", "Z"]);
        assert_eq!(state.mouse, ["Left", "Right"]);
        assert!(!state.is_empty());
        assert!(InputState::default().is_empty());
    }
}
