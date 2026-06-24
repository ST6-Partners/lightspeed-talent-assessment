import fs from 'fs';
const file = 'src/pages/admin/FeedbackPanel.tsx';
if (!fs.existsSync(file)) { console.error('  [MISS] ' + file); process.exit(1); }
let s = fs.readFileSync(file, 'utf8');
let changed = false;
function apply(name, marker, anchor, repl) {
  if (s.includes(marker)) { console.log('  [skip] ' + name + ' (already applied)'); return; }
  if (!s.includes(anchor)) { console.error('  [FAIL] ' + name + ' ANCHOR NOT FOUND'); process.exitCode = 1; return; }
  s = s.replace(anchor, repl); changed = true; console.log('  [ok]   ' + name);
}
apply('saveMsg state', 'const [saveMsg, setSaveMsg]',
  "const [adminNotes, setAdminNotes] = useState('');",
  "const [adminNotes, setAdminNotes] = useState('');\n  const [saveMsg, setSaveMsg] = useState(null);");
apply('updateMutation handlers', 'onError: (err',
  "const updateMutation = trpc.feedbackAdmin.updateStatus.useMutation({ onSuccess: refresh });",
  "const updateMutation = trpc.feedbackAdmin.updateStatus.useMutation({\n" +
  "    onSuccess: (updated) => {\n" +
  "      refresh();\n" +
  "      setSelectedFeedback((prev) => prev ? { ...prev, adminNotes: updated?.adminNotes ?? prev.adminNotes, status: updated?.status ?? prev.status } : prev);\n" +
  "      setSaveMsg({ ok: true, text: 'Saved \\u2713' });\n" +
  "      setTimeout(() => setSaveMsg(null), 2500);\n" +
  "    },\n" +
  "    onError: (err) => setSaveMsg({ ok: false, text: 'Save failed: ' + (err?.message || 'unknown error') }),\n" +
  "  });");
apply('save message UI', 'saveMsg &&',
  "{/* Status Change Buttons */}",
  "{saveMsg && (\n" +
  "              <p className={`text-xs mb-1 ${saveMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{saveMsg.text}</p>\n" +
  "            )}\n" +
  "            {/* Status Change Buttons */}");
if (changed) fs.writeFileSync(file, s);
console.log('\nSave Notes fix complete.');
