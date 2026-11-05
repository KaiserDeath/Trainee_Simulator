import {useState} from 'react';

// First visit mounts a tool; later navigation hides it without losing its form.
export default function HubWorkspacePanel({active, children, ...props}) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return <div {...props} hidden={!active}>{visited ? children : null}</div>;
}
