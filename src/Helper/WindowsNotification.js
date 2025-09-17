export function notifyUser(title, body, icon) {
  try {
    if (!("Notification" in window)) {
      console.warn("This browser does not support notifications.");
      return;
    }

    if (Notification.permission === "granted") {
      new Notification(title, { body, icon });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") {
          new Notification(title, { body, icon });
        }
      });
    }
  } catch (err) {
    console.error("Notification error:", err);
  }
}


export async function asyncNotifyUser(title, body, icon) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification(title, { body, icon });
  }
}

