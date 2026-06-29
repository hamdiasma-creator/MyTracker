import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Modal, StyleSheet, SafeAreaView, StatusBar, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Notifications (APK only — not available in Snack preview) ────────────────
// Pour activer les notifications dans l'APK, ajoute dans app.json :
// "plugins": [["expo-notifications", { "color": "#B5860D" }]]
// et installe : expo install expo-notifications
let Notifications = null;

// ─── Data ─────────────────────────────────────────────────────────────────────

const WEEKS = 4;
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const DAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const TYPE_BUREAU = "bureau";
const TYPE_TELE = "tele";
const TYPE_WEEKEND = "weekend";

const DAY_TYPE_MAP = {
  "Lundi": TYPE_BUREAU,
  "Mardi": TYPE_TELE,
  "Mercredi": TYPE_BUREAU,
  "Jeudi": TYPE_TELE,
  "Vendredi": TYPE_TELE,
  "Samedi": TYPE_WEEKEND,
  "Dimanche": TYPE_WEEKEND,
};

const TASKS_BUREAU = [
  { id: "tisane", label: "Tisane hibiscus fruits rouges" },
  { id: "dejeuner", label: "Dejeuner leger (oeuf dur / toast fromage)" },
  { id: "vitamines", label: "Vitamine D + vitamine femme 40+" },
  { id: "velo_aller", label: "Velo aller (bureau)" },
  { id: "repas_midi", label: "Repas midi", isMeal: true },
  { id: "velo_retour", label: "Velo retour (garderie)" },
  { id: "repas_soir", label: "Souper", isMeal: true },
  { id: "skincare", label: "Skincare soir" },
  { id: "petite_lit", label: "Petite au lit ~20h" },
];

const TASKS_TELE = [
  { id: "tisane", label: "Tisane hibiscus fruits rouges" },
  { id: "dejeuner", label: "Dejeuner (oeuf dur / toast fromage / cafe)" },
  { id: "vitamines", label: "Vitamine D + vitamine femme 40+" },
  { id: "repas_midi", label: "Repas midi", isMeal: true },
  { id: "mouvement", label: "Mouvement 20-30 min (yoga / marche)" },
  { id: "repas_soir", label: "Souper", isMeal: true },
  { id: "skincare", label: "Skincare soir" },
  { id: "petite_lit", label: "Petite au lit ~20h" },
];

const TASKS_WEEKEND = [
  { id: "tisane", label: "Tisane hibiscus fruits rouges" },
  { id: "dejeuner", label: "Dejeuner tranquille" },
  { id: "vitamines", label: "Vitamine D + vitamine femme 40+" },
  { id: "repas_midi", label: "Repas midi", isMeal: true },
  { id: "repas_soir", label: "Souper", isMeal: true },
  { id: "skincare", label: "Skincare soir" },
];

const EXTRAS_VENDREDI = [{ id: "repas_mari", label: "Repas midi avec le mari" }];
const EXTRAS_SAMEDI = [{ id: "batch_cook", label: "Batch cooking / repas weekend" }];
const EXTRAS_DIMANCHE = [
  { id: "temps_moi", label: "Temps pour moi - 1-2h" },
  { id: "masque_cheveux", label: "Masque cheveux" },
];
const EXTRAS_DIMANCHE_SEM1_3 = { id: "ongles", label: "Ongles (mains ou pieds)" };
const EXTRAS_DIMANCHE_SEM1 = [
  { id: "epilation", label: "Epilation (rdv mensuel)" },
  { id: "coupe", label: "Coupe / couleur (tous les 2-3 mois)" },
];

const FREQ_OPTIONS = [
  { id: "once", label: "Une fois" },
  { id: "weekly", label: "Toutes les semaines" },
  { id: "custom", label: "Jours specifiques" },
];

const P = {
  bg: "#FAF7F4", surface: "#FFFFFF",
  bureauBg: "#E8F0F7", bureauAccent: "#3B6FA0",
  teleBg: "#EFF7EE", teleAccent: "#4A8C5C",
  weekendBg: "#F7F0FA", weekendAccent: "#8B5CF6",
  dimancheBg: "#FFF0F5", dimancheAccent: "#C2185B",
  text: "#1A1A2E", muted: "#6B7280", check: "#4A8C5C",
  border: "#E5E0D8", gold: "#B5860D", danger: "#DC2626",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDayType(day) {
  return DAY_TYPE_MAP[day] || TYPE_WEEKEND;
}

function getColorsForDay(day) {
  if (day === "Dimanche") return { bg: P.dimancheBg, accent: P.dimancheAccent, tag: "Dimanche" };
  const t = getDayType(day);
  if (t === TYPE_BUREAU) return { bg: P.bureauBg, accent: P.bureauAccent, tag: "Bureau" };
  if (t === TYPE_TELE) return { bg: P.teleBg, accent: P.teleAccent, tag: "Teletravail" };
  return { bg: P.weekendBg, accent: P.weekendAccent, tag: "Weekend" };
}

function getBaseTasks(day, weekIndex) {
  const t = getDayType(day);
  let base = [];
  if (t === TYPE_BUREAU) base = TASKS_BUREAU.map(x => Object.assign({}, x));
  else if (t === TYPE_TELE) base = TASKS_TELE.map(x => Object.assign({}, x));
  else base = TASKS_WEEKEND.map(x => Object.assign({}, x));

  let extras = [];
  if (day === "Vendredi") extras = EXTRAS_VENDREDI.map(x => Object.assign({}, x));
  else if (day === "Samedi") extras = EXTRAS_SAMEDI.map(x => Object.assign({}, x));
  else if (day === "Dimanche") {
    extras = EXTRAS_DIMANCHE.map(x => Object.assign({}, x));
    if (weekIndex === 0 || weekIndex === 2) extras.push(Object.assign({}, EXTRAS_DIMANCHE_SEM1_3));
    if (weekIndex === 0) extras = extras.concat(EXTRAS_DIMANCHE_SEM1.map(x => Object.assign({}, x)));
  }
  return base.concat(extras);
}

// ─── Date helpers that detect TODAY's weekday ─────────────────────────────────

/**
 * Find the most recent Monday on or before today,
 * then return a Date such that the cycle starts on that Monday.
 * This ensures week/day tabs always align with the real calendar.
 */
function computeCycleStart() {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  // JS: 0=Sun,1=Mon,...,6=Sat. We want Monday=0 offset.
  var jsDay = today.getDay(); // 0=Sun
  // Convert to Mon-based: Mon=0 ... Sun=6
  var monBased = (jsDay + 6) % 7;
  var monday = new Date(today.getTime());
  monday.setDate(today.getDate() - monBased);
  return monday;
}

function getDateForCell(cycleStart, weekIndex, dayIndex) {
  var d = new Date(cycleStart.getTime());
  d.setDate(d.getDate() + weekIndex * 7 + dayIndex);
  return d;
}

function formatDate(date) {
  var months = ["janvier","fevrier","mars","avril","mai","juin","juillet","aout","septembre","octobre","novembre","decembre"];
  return date.getDate() + " " + months[date.getMonth()];
}

function getCurrentWeekAndDay(cycleStart) {
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var start = new Date(cycleStart.getTime()); start.setHours(0, 0, 0, 0);
  var diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
  if (diff < 0 || diff >= 28) return { week: 0, day: 0 };
  return { week: Math.floor(diff / 7), day: diff % 7 };
}

async function load(key, fallback) {
  try { var v = await AsyncStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch(e) { return fallback; }
}

async function save(key, value) {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
}

function cellKey(w, d) { return "w" + w + "-" + d; }
function taskKey(w, d, id) { return "w" + w + "-" + d + "-" + id; }

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [cycleStart, setCycleStart] = useState(null);
  const [ready, setReady] = useState(false);
  const [userName, setUserName] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const [checked, setChecked] = useState({});
  const [meals, setMeals] = useState({});
  const [customs, setCustoms] = useState({});
  const [moved, setMoved] = useState({});
  const [taskOverrides, setTaskOverrides] = useState({}); // label overrides for base tasks

  const [week, setWeek] = useState(0);
  const [dayIdx, setDayIdx] = useState(0);

  // Modals
  const [showReset, setShowReset] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1=confirm, 2=carry options
  const [carryCustoms, setCarryCustoms] = useState(false);
  const [carryOverrides, setCarryOverrides] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newMeal, setNewMeal] = useState(false);
  const [newFreq, setNewFreq] = useState("once");
  const [newDays, setNewDays] = useState([]);

  const [moveMenu, setMoveMenu] = useState(null);
  const [delMenu, setDelMenu] = useState(null);
  const [showDelRepeatModal, setShowDelRepeatModal] = useState(false);

  // Edit task label
  const [editMenu, setEditMenu] = useState(null); // { task, label }
  const [editLabel, setEditLabel] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditScopeModal, setShowEditScopeModal] = useState(false);
  const [pendingEdit, setPendingEdit] = useState(null); // { task, newLabel }

  useEffect(function() {
    var cs = computeCycleStart();
    setCycleStart(cs);

    Promise.all([
      load("ac2", {}),
      load("am2", {}),
      load("cu2", {}),
      load("mv2", {}),
      load("userName", ""),
      load("taskOverrides", {}),
      load("cycleStartStr", null),
    ]).then(function(results) {
      var savedChecked = results[0];
      var savedMeals = results[1];
      var savedCustoms = results[2];
      var savedMoved = results[3];
      var savedName = results[4];
      var savedOverrides = results[5];
      var savedCycleStartStr = results[6];

      // If stored cycle start differs from today's computed Monday, keep stored one
      // so mid-cycle the dates don't shift; only reset on explicit user action
      var effectiveStart = cs;
      if (savedCycleStartStr) {
        var stored = new Date(savedCycleStartStr);
        if (!isNaN(stored.getTime())) effectiveStart = stored;
      } else {
        save("cycleStartStr", cs.toISOString());
      }
      setCycleStart(effectiveStart);

      var initial = getCurrentWeekAndDay(effectiveStart);
      setChecked(savedChecked);
      setMeals(savedMeals);
      setCustoms(savedCustoms);
      setMoved(savedMoved);
      setTaskOverrides(savedOverrides);
      setWeek(initial.week);
      setDayIdx(initial.day);

      if (!savedName) {
        setShowNameModal(true);
      } else {
        setUserName(savedName);
      }
      setReady(true);
    });
  }, []);

  // ─── Notifications (APK uniquement) ────────────────────────────────────────

  useEffect(function() {
    if (!ready || !Notifications) return;
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      (async function() {
        var perm = await Notifications.requestPermissionsAsync();
        if (perm.status !== 'granted') return;
        await scheduleDailyReminder();
      })();
    } catch(e) {}
  }, [ready]);

  async function scheduleDailyReminder() {
    if (!Notifications) return;
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: userName ? "Rappel de " + userName : "Rappel quotidien",
          body: "Tu as des taches non realisees aujourd'hui. Prends soin de toi !",
          sound: true,
        },
        trigger: { hour: 12, minute: 0, repeats: true },
      });
    } catch(e) {}
  }

  // ─── Name modal ────────────────────────────────────────────────────────────

  async function saveName() {
    var n = nameInput.trim();
    if (!n) return;
    setUserName(n);
    await save("userName", n);
    setShowNameModal(false);
  }

  // ─── Tasks logic ───────────────────────────────────────────────────────────

  function getTasksForCell(w, day) {
    var base = getBaseTasks(day, w);
    // Apply label overrides to base tasks
    base = base.map(function(t) {
      var ok = "override-" + t.id;
      if (taskOverrides[ok]) return Object.assign({}, t, { label: taskOverrides[ok] });
      return t;
    });

    var ck = cellKey(w, day);
    var movedArr = moved[ck] || [];
    var removedIds = movedArr.filter(function(x) { return typeof x === "string"; });
    var movedIn = movedArr.filter(function(x) { return typeof x === "object" && x !== null; });
    var filtered = base.filter(function(t) { return removedIds.indexOf(t.id) === -1; });

    var customArr = [];
    Object.keys(customs).forEach(function(key) {
      var tasks = customs[key] || [];
      tasks.forEach(function(task) {
        if (task.freq === "once" && key === ck) {
          customArr.push(Object.assign({}, task, { _custom: true, _sourceKey: key }));
        } else if (task.freq === "weekly") {
          var parts = key.split("-");
          var sourceDay = parts.slice(1).join("-");
          if (sourceDay === day) customArr.push(Object.assign({}, task, { _custom: true, _sourceKey: key }));
        } else if (task.freq === "custom" && task.freqDays && task.freqDays.indexOf(day) !== -1) {
          customArr.push(Object.assign({}, task, { _custom: true, _sourceKey: key }));
        }
      });
    });
    return filtered.concat(movedIn.map(function(t) { return Object.assign({}, t, { _movedIn: true }); })).concat(customArr);
  }

  function getProgress(w, day) {
    var tasks = getTasksForCell(w, day);
    var done = tasks.filter(function(t) { return !!checked[taskKey(w, day, t.id)]; }).length;
    return { done: done, total: tasks.length };
  }

  function getWeekProgress(w) {
    return DAYS.reduce(function(acc, day) {
      var p = getProgress(w, day);
      return { done: acc.done + p.done, total: acc.total + p.total };
    }, { done: 0, total: 0 });
  }

  async function toggle(key) {
    var next = Object.assign({}, checked);
    next[key] = !next[key];
    setChecked(next);
    await save("ac2", next);
  }

  async function updateMeal(key, value) {
    var next = Object.assign({}, meals);
    next[key] = value;
    setMeals(next);
    await save("am2", next);
  }

  async function addTask() {
    if (!newLabel.trim()) return;
    var ck = cellKey(week, DAYS[dayIdx]);
    var task = {
      id: "c" + Date.now(),
      label: newLabel.trim(),
      isMeal: newMeal,
      freq: newFreq,
      freqDays: newFreq === "custom" ? newDays : [],
    };
    var prev = customs[ck] || [];
    var next = Object.assign({}, customs);
    next[ck] = prev.concat([task]);
    setCustoms(next);
    await save("cu2", next);
    setNewLabel(""); setNewMeal(false); setNewFreq("once"); setNewDays([]); setShowAdd(false);
  }

  // ─── Delete task ───────────────────────────────────────────────────────────

  async function deleteTask(taskId, isCustom, sourceKey, deleteAllRepeat) {
    if (isCustom) {
      var next = Object.assign({}, customs);
      if (deleteAllRepeat) {
        // Remove from all keys
        Object.keys(next).forEach(function(k) {
          next[k] = (next[k] || []).filter(function(t) { return t.id !== taskId; });
        });
      } else {
        if (next[sourceKey]) next[sourceKey] = next[sourceKey].filter(function(t) { return t.id !== taskId; });
      }
      setCustoms(next); await save("cu2", next);
    } else {
      // Base task: hide in current cell (or all cells)
      var ck = cellKey(week, DAYS[dayIdx]);
      var next2 = Object.assign({}, moved);
      if (deleteAllRepeat) {
        // Hide in all weeks for all days that have this task
        for (var w = 0; w < WEEKS; w++) {
          DAYS.forEach(function(day) {
            var k = cellKey(w, day);
            var cur = next2[k] || [];
            if (cur.indexOf(taskId) === -1) next2[k] = cur.concat([taskId]);
          });
        }
      } else {
        var cur = next2[ck] || [];
        next2[ck] = cur.filter(function(x) { return x !== taskId; }).concat([taskId]);
      }
      setMoved(next2); await save("mv2", next2);
    }
    setDelMenu(null);
    setShowDelRepeatModal(false);
  }

  function handleDeletePress(task) {
    var isCustom = !!task._custom;
    var isRepeat = isCustom && task.freq && task.freq !== "once";
    setDelMenu({
      taskId: task.id,
      label: task.label,
      isCustom: isCustom,
      sourceKey: task._sourceKey || cellKey(week, DAYS[dayIdx]),
      isRepeat: isRepeat,
    });
    if (isRepeat) {
      setShowDelRepeatModal(true);
    }
    // Non-repeat: regular delete modal will show via delMenu
  }

  // ─── Edit task label ───────────────────────────────────────────────────────

  function handleEditPress(task) {
    setEditMenu(task);
    setEditLabel(task.label);
    setShowEditModal(true);
  }

  async function applyEdit(scope) {
    // scope: "once" | "all_same_id" | "as_new_task"
    var task = pendingEdit.task;
    var newLbl = pendingEdit.newLabel;
    var isCustom = !!task._custom;

    if (scope === "once") {
      // Override only this cell
      var ck = cellKey(week, DAYS[dayIdx]);
      if (isCustom) {
        var next = Object.assign({}, customs);
        if (next[task._sourceKey]) {
          next[task._sourceKey] = next[task._sourceKey].map(function(t) {
            if (t.id === task.id) return Object.assign({}, t, { label: newLbl });
            return t;
          });
        }
        setCustoms(next); await save("cu2", next);
      } else {
        // For base tasks, store a one-time override keyed by cell+taskId
        var overrideKey = ck + "-lbl-" + task.id;
        var nextO = Object.assign({}, taskOverrides);
        nextO[overrideKey] = newLbl;
        setTaskOverrides(nextO); await save("taskOverrides", nextO);
      }
    } else if (scope === "all_same_id") {
      // Override label everywhere this task appears (by id)
      if (isCustom) {
        var next2 = Object.assign({}, customs);
        Object.keys(next2).forEach(function(k) {
          next2[k] = (next2[k] || []).map(function(t) {
            if (t.id === task.id) return Object.assign({}, t, { label: newLbl });
            return t;
          });
        });
        setCustoms(next2); await save("cu2", next2);
      } else {
        var nextO2 = Object.assign({}, taskOverrides);
        nextO2["override-" + task.id] = newLbl;
        setTaskOverrides(nextO2); await save("taskOverrides", nextO2);
      }
    } else if (scope === "as_new_task") {
      // Create new recurring custom task with new label, and delete old in this cell
      var ck2 = cellKey(week, DAYS[dayIdx]);
      var newTask = {
        id: "c" + Date.now(),
        label: newLbl,
        isMeal: !!task.isMeal,
        freq: "weekly",
        freqDays: [],
      };
      var prevC = customs[ck2] || [];
      var nextC = Object.assign({}, customs);
      nextC[ck2] = prevC.concat([newTask]);
      // Hide old base task in all cells
      if (!isCustom) {
        var nextM = Object.assign({}, moved);
        for (var ww = 0; ww < WEEKS; ww++) {
          DAYS.forEach(function(day) {
            var k = cellKey(ww, day);
            var cur = nextM[k] || [];
            if (cur.indexOf(task.id) === -1) nextM[k] = cur.concat([task.id]);
          });
        }
        setMoved(nextM); await save("mv2", nextM);
      }
      setCustoms(nextC); await save("cu2", nextC);
    }

    setShowEditScopeModal(false);
    setPendingEdit(null);
  }

  // ─── Move task ─────────────────────────────────────────────────────────────

  async function moveTask(task, targetDayIdx) {
    var currentDay = DAYS[dayIdx];
    var targetDay = DAYS[targetDayIdx];
    var srcCk = cellKey(week, currentDay);
    var tgtCk = cellKey(week, targetDay);
    var srcList = moved[srcCk] || [];
    var tgtList = moved[tgtCk] || [];
    var next = Object.assign({}, moved);
    next[srcCk] = srcList.filter(function(x) { return x !== task.id; }).concat([task.id]);
    next[tgtCk] = tgtList.filter(function(x) { return typeof x !== "object" || x === null || x.id !== task.id; }).concat([Object.assign({}, task, { movedFrom: currentDay })]);
    setMoved(next); await save("mv2", next);
    setMoveMenu(null);
  }

  // ─── Reset ─────────────────────────────────────────────────────────────────

  async function handleReset(opts) {
    // opts: { keepOverrides, keepCustoms }
    var newChecked = {};
    var newMeals = {};
    var newMoved = {};
    var newCustoms = carryCustoms ? Object.assign({}, customs) : {};
    var newOverrides = carryOverrides ? Object.assign({}, taskOverrides) : {};

    // Compute new cycle start from today
    var newStart = computeCycleStart();
    setCycleStart(newStart);
    await save("cycleStartStr", newStart.toISOString());

    var initial = getCurrentWeekAndDay(newStart);
    setChecked(newChecked);
    setMeals(newMeals);
    setMoved(newMoved);
    setCustoms(newCustoms);
    setTaskOverrides(newOverrides);
    setWeek(initial.week);
    setDayIdx(initial.day);

    await Promise.all([
      save("ac2", newChecked),
      save("am2", newMeals),
      save("mv2", newMoved),
      save("cu2", newCustoms),
      save("taskOverrides", newOverrides),
    ]);

    setShowReset(false);
    setResetStep(1);
    setCarryCustoms(false);
    setCarryOverrides(false);
  }

  // ─── Render guards ─────────────────────────────────────────────────────────

  if (!ready || !cycleStart) {
    return (
      <SafeAreaView style={{ flex:1, backgroundColor: P.bg, justifyContent:"center", alignItems:"center" }}>
        <Text style={{ color: P.muted, fontSize: 16 }}>Chargement...</Text>
      </SafeAreaView>
    );
  }

  var currentDay = DAYS[dayIdx];
  var colors = getColorsForDay(currentDay);
  var tasks = getTasksForCell(week, currentDay);
  var prog = getProgress(week, currentDay);
  var pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
  var todayDate = getDateForCell(cycleStart, week, dayIdx);

  // ─── UI ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: P.bg }}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Name Modal */}
      <Modal visible={showNameModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={{ fontSize:32, textAlign:"center", marginBottom:10 }}>👋</Text>
            <Text style={s.modalTitle}>Bienvenue !</Text>
            <Text style={s.modalDesc}>Comment tu t'appelles ? Ton prenom sera affiche dans l'application.</Text>
            <TextInput
              style={s.input}
              placeholder="Ton prenom..."
              placeholderTextColor={P.muted}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
            />
            <TouchableOpacity
              style={[s.btnPrimary, { backgroundColor: P.gold, opacity: nameInput.trim() ? 1 : 0.4 }]}
              onPress={saveName}
              disabled={!nameInput.trim()}
            >
              <Text style={s.btnPrimaryTxt}>Commencer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reset Modal — Step 1: confirm */}
      <Modal visible={showReset && resetStep === 1} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalEmoji}>🔄</Text>
            <Text style={s.modalTitle}>Nouveau cycle ?</Text>
            <Text style={s.modalDesc}>
              Le nouveau cycle commencera a partir d'aujourd'hui ({formatDate(new Date())}).
              {"\n\n"}Les coches et repas seront remis a zero.
            </Text>
            <View style={s.row}>
              <TouchableOpacity style={s.btnCancel} onPress={function(){ setShowReset(false); setResetStep(1); }}>
                <Text style={s.btnCancelTxt}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnPrimary, { backgroundColor: colors.accent }]} onPress={function(){ setResetStep(2); }}>
                <Text style={s.btnPrimaryTxt}>Continuer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reset Modal — Step 2: carry-over options */}
      <Modal visible={showReset && resetStep === 2} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalEmoji}>📋</Text>
            <Text style={s.modalTitle}>Que garder du cycle precedent ?</Text>

            <TouchableOpacity style={s.carryRow} onPress={function(){ setCarryOverrides(!carryOverrides); }}>
              <View style={[s.circle, carryOverrides && { backgroundColor: P.check, borderColor: P.check }]}>
                {carryOverrides ? <Text style={{ color:"#fff", fontSize:11 }}>✓</Text> : null}
              </View>
              <View style={{ flex:1 }}>
                <Text style={s.carryTitle}>Garder les taches modifiees</Text>
                <Text style={s.carrySub}>Les taches de base que tu as renommees seront conservees</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={s.carryRow} onPress={function(){ setCarryCustoms(!carryCustoms); }}>
              <View style={[s.circle, carryCustoms && { backgroundColor: P.check, borderColor: P.check }]}>
                {carryCustoms ? <Text style={{ color:"#fff", fontSize:11 }}>✓</Text> : null}
              </View>
              <View style={{ flex:1 }}>
                <Text style={s.carryTitle}>Garder les taches ajoutees</Text>
                <Text style={s.carrySub}>Les nouvelles taches que tu as creees seront conservees</Text>
              </View>
            </TouchableOpacity>

            <Text style={[s.modalDesc, { marginTop: 8 }]}>
              Sans selection, le programme revient aux taches de base.
            </Text>

            <View style={s.row}>
              <TouchableOpacity style={s.btnCancel} onPress={function(){ setResetStep(1); }}>
                <Text style={s.btnCancelTxt}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnDanger} onPress={handleReset}>
                <Text style={s.btnDangerTxt}>Reinitialiser</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Task Modal */}
      <Modal visible={showAdd} transparent animationType="slide">
        <View style={s.overlayBottom}>
          <View style={s.modalBottom}>
            <Text style={s.modalTitle}>Ajouter une tache</Text>
            <TextInput style={s.input} placeholder="Description..." placeholderTextColor={P.muted} value={newLabel} onChangeText={setNewLabel} />
            <TouchableOpacity style={s.checkRow} onPress={function(){ setNewMeal(!newMeal); }}>
              <View style={[s.circle, newMeal && { backgroundColor: P.check, borderColor: P.check }]}>
                {newMeal ? <Text style={{ color:"#fff", fontSize:11 }}>✓</Text> : null}
              </View>
              <Text style={s.checkTxt}>C'est un repas (avec champ texte)</Text>
            </TouchableOpacity>
            <Text style={s.sectionLbl}>Frequence</Text>
            <View style={s.row}>
              {FREQ_OPTIONS.map(function(f) {
                var active = newFreq === f.id;
                return (
                  <TouchableOpacity key={f.id} onPress={function(){ setNewFreq(f.id); }}
                    style={[s.freqBtn, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                    <Text style={[s.freqBtnTxt, active && { color:"#fff" }]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {newFreq === "custom" ? (
              <View style={{ marginTop: 10 }}>
                <Text style={s.sectionLbl}>Jours</Text>
                <View style={s.row}>
                  {DAYS.map(function(d, i) {
                    var sel = newDays.indexOf(d) !== -1;
                    return (
                      <TouchableOpacity key={d} onPress={function(){ setNewDays(function(prev) { return sel ? prev.filter(function(x){ return x!==d; }) : prev.concat([d]); }); }}
                        style={[s.dayBtn, sel && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                        <Text style={[s.dayBtnTxt, sel && { color:"#fff" }]}>{DAY_SHORT[i]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}
            <View style={[s.row, { marginTop: 16 }]}>
              <TouchableOpacity style={s.btnCancel} onPress={function(){ setShowAdd(false); setNewLabel(""); setNewFreq("once"); setNewDays([]); setNewMeal(false); }}>
                <Text style={s.btnCancelTxt}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnPrimary, { backgroundColor: colors.accent }]} onPress={addTask}>
                <Text style={s.btnPrimaryTxt}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit label modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={s.overlayBottom}>
          <View style={s.modalBottom}>
            <Text style={s.modalTitle}>Modifier la tache</Text>
            <TextInput
              style={s.input}
              value={editLabel}
              onChangeText={setEditLabel}
              placeholderTextColor={P.muted}
              placeholder="Nouveau nom..."
              autoFocus
            />
            <View style={s.row}>
              <TouchableOpacity style={s.btnCancel} onPress={function(){ setShowEditModal(false); }}>
                <Text style={s.btnCancelTxt}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnPrimary, { backgroundColor: colors.accent }]} onPress={function(){
                if (!editLabel.trim()) return;
                setPendingEdit({ task: editMenu, newLabel: editLabel.trim() });
                setShowEditModal(false);
                setShowEditScopeModal(true);
              }}>
                <Text style={s.btnPrimaryTxt}>Suivant</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit scope modal */}
      <Modal visible={showEditScopeModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalEmoji}>✏️</Text>
            <Text style={s.modalTitle}>Appliquer la modification a...</Text>
            {pendingEdit ? <Text style={s.modalDesc}>"{pendingEdit.newLabel}"</Text> : null}

            <TouchableOpacity style={s.moveBtn} onPress={function(){ applyEdit("once"); }}>
              <View>
                <Text style={s.moveBtnDay}>Seulement aujourd'hui</Text>
                <Text style={s.moveBtnDate}>Cette occurrence uniquement</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={s.moveBtn} onPress={function(){ applyEdit("all_same_id"); }}>
              <View>
                <Text style={s.moveBtnDay}>Toutes les occurrences</Text>
                <Text style={s.moveBtnDate}>Remplace partout ou cette tache apparait</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={s.moveBtn} onPress={function(){ applyEdit("as_new_task"); }}>
              <View>
                <Text style={s.moveBtnDay}>Creer une nouvelle tache repetitive</Text>
                <Text style={s.moveBtnDate}>Remplace la tache originale par celle-ci chaque semaine</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[s.btnCancel, { marginTop: 8 }]} onPress={function(){ setShowEditScopeModal(false); setPendingEdit(null); }}>
              <Text style={s.btnCancelTxt}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Move Modal */}
      <Modal visible={!!moveMenu} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Deplacer vers...</Text>
            {moveMenu ? <Text style={s.modalDesc}>"{moveMenu.label}"</Text> : null}
            {DAYS.map(function(d, i) {
              if (d === currentDay) return null;
              return (
                <TouchableOpacity key={d} style={s.moveBtn} onPress={function(){ moveTask(moveMenu.task, i); }}>
                  <Text style={s.moveBtnDay}>{d}</Text>
                  <Text style={s.moveBtnDate}>{formatDate(getDateForCell(cycleStart, week, i))}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[s.btnCancel, { marginTop: 8 }]} onPress={function(){ setMoveMenu(null); }}>
              <Text style={s.btnCancelTxt}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete repeat modal (for repeating tasks) */}
      <Modal visible={showDelRepeatModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalEmoji}>🗑️</Text>
            <Text style={s.modalTitle}>Supprimer cette tache ?</Text>
            {delMenu ? <Text style={s.modalDesc}>"{delMenu.label}"</Text> : null}

            <TouchableOpacity style={s.moveBtn} onPress={function(){
              deleteTask(delMenu.taskId, delMenu.isCustom, delMenu.sourceKey, false);
            }}>
              <Text style={s.moveBtnDay}>Seulement aujourd'hui</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.moveBtn} onPress={function(){
              deleteTask(delMenu.taskId, delMenu.isCustom, delMenu.sourceKey, true);
            }}>
              <Text style={s.moveBtnDay}>Toutes les occurrences</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.btnCancel, { marginTop: 8 }]} onPress={function(){ setShowDelRepeatModal(false); setDelMenu(null); }}>
              <Text style={s.btnCancelTxt}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete modal (non-repeat) */}
      <Modal visible={!!delMenu && !showDelRepeatModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalEmoji}>🗑️</Text>
            <Text style={s.modalTitle}>Supprimer cette tache ?</Text>
            {delMenu ? <Text style={s.modalDesc}>"{delMenu.label}"</Text> : null}
            <View style={s.row}>
              <TouchableOpacity style={s.btnCancel} onPress={function(){ setDelMenu(null); }}>
                <Text style={s.btnCancelTxt}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnDanger} onPress={function(){
                deleteTask(delMenu.taskId, delMenu.isCustom, delMenu.sourceKey, false);
              }}>
                <Text style={s.btnDangerTxt}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={s.header}>
        <View style={{ flex:1 }}>
          <Text style={s.headerSub}>Programme Personnel</Text>
          <Text style={s.headerTitle}>
            {userName ? "Bonjour " + userName + " 🌸" : "Mon plan de vie"}
          </Text>
        </View>
        <TouchableOpacity style={s.resetBtn} onPress={function(){ setShowReset(true); setResetStep(1); }}>
          <Text style={s.resetBtnTxt}>Nouveau cycle</Text>
        </TouchableOpacity>
      </View>

      {/* Week tabs */}
      <View style={s.weekRow}>
        {Array.from({ length: WEEKS }).map(function(_, w) {
          var wp = getWeekProgress(w);
          var active = w === week;
          var sd = getDateForCell(cycleStart, w, 0);
          return (
            <TouchableOpacity key={w} onPress={function(){ setWeek(w); }}
              style={[s.weekTab, active && { borderColor: P.gold, borderWidth:2, backgroundColor:"#FFF8E8" }]}>
              <Text style={[s.weekTabTxt, active && { color: P.gold, fontWeight:"700" }]}>Sem {w+1}</Text>
              <Text style={s.weekTabDate}>{sd.getDate()}/{sd.getMonth()+1}</Text>
              <Text style={s.weekTabProg}>{wp.done}/{wp.total}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Day tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight:68, backgroundColor:"#fff" }} contentContainerStyle={{ paddingHorizontal:10, paddingVertical:8, gap:6 }}>
        {DAYS.map(function(day, i) {
          var p = getProgress(week, day);
          var isActive = i === dayIdx;
          var dc = getColorsForDay(day);
          var allDone = p.done === p.total && p.total > 0;
          var cd = getDateForCell(cycleStart, week, i);
          var isToday = cd.toDateString() === new Date().toDateString();
          return (
            <TouchableOpacity key={day} onPress={function(){ setDayIdx(i); }}
              style={[s.dayTab, isActive && { backgroundColor: dc.accent, borderColor: dc.accent }, isToday && !isActive && { borderColor: P.gold, borderWidth:2 }, allDone && !isActive && { backgroundColor:"#F0FFF4" }]}>
              <Text style={[s.dayTabTxt, isActive && { color:"#fff" }]}>{DAY_SHORT[i]}</Text>
              <Text style={[s.dayTabDate, isActive && { color:"rgba(255,255,255,0.8)" }]}>{cd.getDate()}</Text>
              <Text style={[s.dayTabProg, isActive && { color:"rgba(255,255,255,0.8)" }]}>{allDone ? "ok" : (p.done+"/"+p.total)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:12, paddingBottom: Platform.OS === 'android' ? 80 : 40 }}>

        {/* Day header */}
        <View style={[s.dayHeader, { backgroundColor: colors.bg, borderColor: colors.accent + "44" }]}>
          <View style={{ flex:1 }}>
            <Text style={[s.dayHeaderTag, { color: colors.accent }]}>{colors.tag}</Text>
            <Text style={s.dayHeaderName}>{currentDay}</Text>
            <Text style={s.dayHeaderDate}>{formatDate(todayDate)}</Text>
          </View>
          <View style={{ alignItems:"flex-end" }}>
            <Text style={[s.dayHeaderPct, { color: pct===100 ? P.check : colors.accent }]}>{pct}%</Text>
            <Text style={s.dayHeaderSub}>{prog.done}/{prog.total} taches</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={s.progressBg}>
          <View style={[s.progressFill, { width: pct+"%", backgroundColor: pct===100 ? P.check : colors.accent }]} />
        </View>

        {/* Tasks */}
        {tasks.map(function(task) {
          var key = taskKey(week, currentDay, task.id);
          var isDone = !!checked[key];
          var isMeal = !!task.isMeal;
          var mealKey = key + "-t";
          var mealVal = meals[mealKey] || "";
          var isCustom = !!task._custom;
          var isMovedIn = !!task._movedIn;

          var actions = (
            <View style={{ flexDirection:"row", gap:4 }}>
              <TouchableOpacity style={s.actBtn} onPress={function(){ handleEditPress(task); }}>
                <Text style={{ fontSize:12, color: P.muted }}>✎</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actBtn} onPress={function(){ setMoveMenu({ task: task, label: task.label, taskId: task.id, isCustom: isCustom }); }}>
                <Text style={{ fontSize:12, color: P.muted }}>⇄</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actBtnRed} onPress={function(){ handleDeletePress(task); }}>
                <Text style={{ fontSize:12, color: P.danger }}>✕</Text>
              </TouchableOpacity>
            </View>
          );

          if (isMeal) {
            return (
              <View key={task.id} style={[s.card, isDone && s.cardDone, { borderColor: isDone ? "#86EFAC" : P.gold+"99" }]}>
                <TouchableOpacity style={s.cardRow} onPress={function(){ toggle(key); }}>
                  <View style={[s.circle, { borderColor: P.gold }, isDone && { backgroundColor: P.check, borderColor: P.check }]}>
                    {isDone ? <Text style={{ color:"#fff", fontSize:11 }}>✓</Text> : null}
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={[s.cardLabel, isDone && s.cardLabelDone]}>{task.label}</Text>
                    {isMovedIn ? <Text style={s.cardMeta}>Deplace depuis {task.movedFrom}</Text> : null}
                    {mealVal ? <Text style={s.mealPrev}>{mealVal}</Text> : <Text style={[s.cardMeta, { color: P.gold }]}>Renseigne ce que tu mangeras</Text>}
                  </View>
                  {actions}
                </TouchableOpacity>
                <TextInput style={s.mealInput} placeholder="Ex: Salade cesar..." placeholderTextColor={P.muted} value={mealVal} onChangeText={function(v){ updateMeal(mealKey, v); }} />
              </View>
            );
          }

          return (
            <TouchableOpacity key={task.id} style={[s.card, isDone && s.cardDone]} onPress={function(){ toggle(key); }}>
              <View style={s.cardRow}>
                <View style={[s.circle, { borderColor: colors.accent }, isDone && { backgroundColor: P.check, borderColor: P.check }]}>
                  {isDone ? <Text style={{ color:"#fff", fontSize:11 }}>✓</Text> : null}
                </View>
                <View style={{ flex:1 }}>
                  <Text style={[s.cardLabel, isDone && s.cardLabelDone]}>{task.label}</Text>
                  {isMovedIn ? <Text style={s.cardMeta}>Deplace depuis {task.movedFrom}</Text> : null}
                  {isCustom && task.freq !== "once" ? (
                    <Text style={[s.cardMeta, { color: colors.accent }]}>
                      {task.freq === "weekly" ? "Repete chaque semaine" : ("Repete: " + (task.freqDays || []).join(", "))}
                    </Text>
                  ) : null}
                </View>
                {actions}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Add button */}
        <TouchableOpacity style={[s.addBtn, { borderColor: colors.accent }]} onPress={function(){ setShowAdd(true); }}>
          <Text style={[s.addBtnTxt, { color: colors.accent }]}>+ Ajouter une tache</Text>
        </TouchableOpacity>

        {/* Done message */}
        {pct === 100 ? (
          <View style={s.doneCard}>
            <Text style={{ fontSize:28, marginBottom:6 }}>🌟</Text>
            <Text style={s.doneTxt}>Journee complete !</Text>
            <Text style={s.doneSub}>{userName ? userName + ", tu as pris soin de toi aujourd'hui." : "Tu as pris soin de toi aujourd'hui."}</Text>
          </View>
        ) : null}

        {/* Notes */}
        <View style={s.notesCard}>
          <Text style={s.notesTit}>Notes du programme</Text>
          <Text style={s.notesTxt}>
            {"Ongles — Dim. sem. 1 & 3\nMasque cheveux — Dim. chaque semaine\nEpilation — Dim. sem. 1 (mensuel)\nCoupe/couleur — Dim. sem. 1 (2-3 mois)\nRappel quotidien — midi"}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

var s = StyleSheet.create({
  overlay: { flex:1, backgroundColor:"rgba(0,0,0,0.5)", justifyContent:"center", alignItems:"center", padding:20 },
  overlayBottom: { flex:1, backgroundColor:"rgba(0,0,0,0.5)", justifyContent:"flex-end" },
  modal: { backgroundColor:"#fff", borderRadius:16, padding:22, width:"100%" },
  modalBottom: { backgroundColor:"#fff", borderRadius:16, padding:22 },
  modalEmoji: { fontSize:30, textAlign:"center", marginBottom:10 },
  modalTitle: { fontSize:16, fontWeight:"600", textAlign:"center", marginBottom:8, color:"#1A1A2E" },
  modalDesc: { fontSize:13, color:"#6B7280", textAlign:"center", lineHeight:20, marginBottom:16 },
  row: { flexDirection:"row", gap:8, flexWrap:"wrap" },
  btnCancel: { flex:1, padding:12, borderWidth:1, borderColor:"#E5E0D8", borderRadius:10, alignItems:"center" },
  btnCancelTxt: { fontSize:14, color:"#1A1A2E" },
  btnDanger: { flex:1, padding:12, backgroundColor:"#DC2626", borderRadius:10, alignItems:"center" },
  btnDangerTxt: { fontSize:14, color:"#fff", fontWeight:"700" },
  btnPrimary: { flex:1, padding:12, borderRadius:10, alignItems:"center" },
  btnPrimaryTxt: { fontSize:14, color:"#fff", fontWeight:"700" },
  input: { borderWidth:1, borderColor:"#E5E0D8", borderRadius:8, padding:10, fontSize:14, color:"#1A1A2E", marginBottom:12 },
  checkRow: { flexDirection:"row", alignItems:"center", gap:10, marginBottom:12 },
  checkTxt: { fontSize:13, color:"#1A1A2E" },
  sectionLbl: { fontSize:11, color:"#6B7280", textTransform:"uppercase", letterSpacing:1, marginBottom:6 },
  freqBtn: { paddingVertical:7, paddingHorizontal:10, borderRadius:20, borderWidth:1, borderColor:"#E5E0D8" },
  freqBtnTxt: { fontSize:12, color:"#1A1A2E" },
  dayBtn: { paddingVertical:6, paddingHorizontal:7, borderRadius:8, borderWidth:1, borderColor:"#E5E0D8" },
  dayBtnTxt: { fontSize:11, color:"#1A1A2E" },
  moveBtn: { flexDirection:"row", justifyContent:"space-between", padding:12, borderWidth:1, borderColor:"#E5E0D8", borderRadius:10, marginBottom:6, backgroundColor:"#FAF7F4" },
  moveBtnDay: { fontSize:14, color:"#1A1A2E" },
  moveBtnDate: { fontSize:12, color:"#6B7280" },
  carryRow: { flexDirection:"row", alignItems:"flex-start", gap:12, padding:12, borderWidth:1, borderColor:"#E5E0D8", borderRadius:10, marginBottom:8, backgroundColor:"#FAF7F4" },
  carryTitle: { fontSize:14, color:"#1A1A2E", fontWeight:"600" },
  carrySub: { fontSize:12, color:"#6B7280", marginTop:2 },
  header: { flexDirection:"row", alignItems:"center", backgroundColor:"#fff", paddingHorizontal:14, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 32) + 10 : 10, paddingBottom:10, borderBottomWidth:1, borderBottomColor:"#E5E0D8" },
  headerSub: { fontSize:10, color:"#B5860D", textTransform:"uppercase", letterSpacing:2, marginBottom:2 },
  headerTitle: { fontSize:18, color:"#1A1A2E", fontWeight:"600" },
  resetBtn: { borderWidth:1, borderColor:"#3B6FA044", borderRadius:8, backgroundColor:"#E8F0F7", paddingHorizontal:10, paddingVertical:6 },
  resetBtnTxt: { fontSize:11, color:"#3B6FA0" },
  weekRow: { flexDirection:"row", gap:6, paddingHorizontal:10, paddingVertical:8, backgroundColor:"#fff", borderBottomWidth:1, borderBottomColor:"#E5E0D8" },
  weekTab: { flex:1, alignItems:"center", padding:6, borderWidth:1, borderColor:"#E5E0D8", borderRadius:8, backgroundColor:"#fff" },
  weekTabTxt: { fontSize:11, color:"#6B7280" },
  weekTabDate: { fontSize:9, color:"#6B7280", marginTop:1 },
  weekTabProg: { fontSize:10, color:"#6B7280", marginTop:1 },
  dayTab: { alignItems:"center", paddingVertical:6, paddingHorizontal:9, borderWidth:1, borderColor:"#E5E0D8", borderRadius:10, backgroundColor:"#fff", minWidth:46 },
  dayTabTxt: { fontSize:11, color:"#1A1A2E" },
  dayTabDate: { fontSize:9, color:"#6B7280", marginTop:1 },
  dayTabProg: { fontSize:9, color:"#6B7280", marginTop:1 },
  dayHeader: { borderRadius:14, padding:14, marginBottom:8, borderWidth:1 },
  dayHeaderTag: { fontSize:11, fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:2 },
  dayHeaderName: { fontSize:20, color:"#1A1A2E" },
  dayHeaderDate: { fontSize:12, color:"#6B7280", marginTop:2 },
  dayHeaderPct: { fontSize:26, fontWeight:"bold" },
  dayHeaderSub: { fontSize:11, color:"#6B7280" },
  progressBg: { height:4, backgroundColor:"#E5E0D8", borderRadius:4, marginBottom:10 },
  progressFill: { height:4, borderRadius:4 },
  card: { backgroundColor:"#fff", borderWidth:1, borderColor:"#E5E0D8", borderRadius:12, marginBottom:8, overflow:"hidden" },
  cardDone: { backgroundColor:"#F0FFF4", borderColor:"#86EFAC" },
  cardRow: { flexDirection:"row", alignItems:"center", gap:12, padding:13 },
  circle: { width:22, height:22, borderRadius:11, borderWidth:2, alignItems:"center", justifyContent:"center", flexShrink:0 },
  cardLabel: { fontSize:14, color:"#1A1A2E", lineHeight:20 },
  cardLabelDone: { color:"#6B7280", textDecorationLine:"line-through" },
  cardMeta: { fontSize:11, color:"#6B7280", marginTop:2 },
  mealPrev: { fontSize:12, color:"#6B7280", marginTop:2, fontStyle:"italic" },
  mealInput: { borderTopWidth:1, borderTopColor:"#E5E0D8", padding:10, fontSize:13, color:"#1A1A2E", backgroundColor:"#FAF7F4" },
  actBtn: { borderWidth:1, borderColor:"#E5E0D8", borderRadius:6, backgroundColor:"#FAF7F4", paddingHorizontal:8, paddingVertical:4 },
  actBtnRed: { borderWidth:1, borderColor:"#DC262633", borderRadius:6, backgroundColor:"#FFF5F5", paddingHorizontal:8, paddingVertical:4 },
  addBtn: { borderWidth:1.5, borderStyle:"dashed", borderRadius:12, padding:14, alignItems:"center", marginTop:4, marginBottom:14 },
  addBtnTxt: { fontSize:13 },
  doneCard: { backgroundColor:"#F0FFF4", borderWidth:1, borderColor:"#86EFAC", borderRadius:14, padding:18, alignItems:"center", marginBottom:14 },
  doneTxt: { fontWeight:"700", color:"#4A8C5C", marginBottom:4, fontSize:15 },
  doneSub: { fontSize:13, color:"#6B7280" },
  notesCard: { backgroundColor:"#FFF8E8", borderRadius:12, padding:14, borderWidth:1, borderColor:"#B5860D44" },
  notesTit: { fontSize:11, color:"#B5860D", fontWeight:"700", textTransform:"uppercase", letterSpacing:1, marginBottom:8 },
  notesTxt: { fontSize:12, color:"#1A1A2E", lineHeight:20 },
});
