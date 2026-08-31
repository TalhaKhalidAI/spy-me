const fs = require('fs');
const file = 'Frontend/talha-boilerplate/src/pages/SfuTest/index.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
/(\{\/\* Per-User Actions Hover \*\/\}\s*\{onRemoteAction && true && \(\s*<div[^>]*>\s*<div[^>]*>)\s*<button className="([^"]*)" onClick=\{\(\) => onRemoteAction\('refreshPage', id\)\}>([\s\S]*?)<\/button>\s*<button className="([^"]*)" onClick=\{\(\) => onRemoteAction\('closeTab', id\)\}>([\s\S]*?)<\/button>\s*<button className="([^"]*)" onClick=\{\(\) => \{\s*onRemoteAction\('toggleCamera', id\);\s*\}\}>([\s\S]*?)<\/button>\s*<button className="([^"]*)" onClick=\{\(\) => \{\s*onRemoteAction\('toggleMic', id\);\s*\}\}>([\s\S]*?)<\/button>/g,
`$1
                      <button className="$2 \${!isAdmin && !hasPerm('permission.remove.peer') ? 'opacity-50 cursor-not-allowed' : ''}" onClick={() => { if (!isAdmin && !hasPerm('permission.remove.peer')) { ToastMsgs.error('❌ Check permission: permission.remove.peer'); return; } onRemoteAction('refreshPage', id); }}>$3</button>
                      <button className="$4 \${!isAdmin && !hasPerm('permission.remove.peer') ? 'opacity-50 cursor-not-allowed' : ''}" onClick={() => { if (!isAdmin && !hasPerm('permission.remove.peer')) { ToastMsgs.error('❌ Check permission: permission.remove.peer'); return; } onRemoteAction('closeTab', id); }}>$5</button>
                      <button className="$6 \${!isAdmin && !hasPerm('permission.remove.peer') ? 'opacity-50 cursor-not-allowed' : ''}" onClick={() => { if (!isAdmin && !hasPerm('permission.remove.peer')) { ToastMsgs.error('❌ Check permission: permission.remove.peer'); return; } onRemoteAction('toggleCamera', id); }}>$7</button>
                      <button className="$8 \${!isAdmin && !hasPerm('permission.remove.peer') ? 'opacity-50 cursor-not-allowed' : ''}" onClick={() => { if (!isAdmin && !hasPerm('permission.remove.peer')) { ToastMsgs.error('❌ Check permission: permission.remove.peer'); return; } onRemoteAction('toggleMic', id); }}>$9</button>`
);

content = content.replace(
/(\{onRemoteAction && true && \(\s*<div className="flex flex-wrap items-center justify-center gap-3 mb-6">\s*<span[^>]*>Global Override<\/span>\s*)<button className="([^"]*)" onClick=\{\(\) => onRemoteAction\('refreshPage'\)\}>([\s\S]*?)<\/button>\s*<button className="([^"]*)" onClick=\{\(\) => onRemoteAction\('closeTab'\)\}>([\s\S]*?)<\/button>\s*<button className="([^"]*)" onClick=\{\(\) => \{\s*onRemoteAction\('toggleCamera', undefined\);\s*\}\}>([\s\S]*?)<\/button>\s*<button className="([^"]*)" onClick=\{\(\) => \{\s*onRemoteAction\('toggleMic', undefined\);\s*\}\}>([\s\S]*?)<\/button>/g,
`$1<button className="$2 \${!isAdmin && !hasPerm('permission.remove.peer') ? 'opacity-50 cursor-not-allowed' : ''}" onClick={() => { if (!isAdmin && !hasPerm('permission.remove.peer')) { ToastMsgs.error('❌ Check permission: permission.remove.peer'); return; } onRemoteAction('refreshPage'); }}>$3</button>
              <button className="$4 \${!isAdmin && !hasPerm('permission.remove.peer') ? 'opacity-50 cursor-not-allowed' : ''}" onClick={() => { if (!isAdmin && !hasPerm('permission.remove.peer')) { ToastMsgs.error('❌ Check permission: permission.remove.peer'); return; } onRemoteAction('closeTab'); }}>$5</button>
              <button className="$6 \${!isAdmin && !hasPerm('permission.remove.peer') ? 'opacity-50 cursor-not-allowed' : ''}" onClick={() => { if (!isAdmin && !hasPerm('permission.remove.peer')) { ToastMsgs.error('❌ Check permission: permission.remove.peer'); return; } onRemoteAction('toggleCamera', undefined); }}>$7</button>
              <button className="$8 \${!isAdmin && !hasPerm('permission.remove.peer') ? 'opacity-50 cursor-not-allowed' : ''}" onClick={() => { if (!isAdmin && !hasPerm('permission.remove.peer')) { ToastMsgs.error('❌ Check permission: permission.remove.peer'); return; } onRemoteAction('toggleMic', undefined); }}>$9</button>`
);

fs.writeFileSync(file, content);
