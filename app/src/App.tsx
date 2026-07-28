//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { AppShell } from "./components/AppShell";
import { ExecutiveSummaryV2 } from "./components/ExecutiveSummaryV2";
import { Explorer } from "./components/Explorer";
import { ActionCenter } from "./components/ActionCenter";
import { AnomalyScore } from "./components/AnomalyScore";
import { Chargeback } from "./components/Chargeback";
import { DataAgentChat } from "./components/DataAgentChat";
import { PeriodProvider } from "./lib/period";
import { RoleProvider, useRole } from "./lib/roles";
import { ChatProvider } from "./lib/chat";

function ActiveView() {
  const { activeView } = useRole();
  return (
    <AppShell>
      {activeView === "summary2" && <ExecutiveSummaryV2 />}
      {activeView === "explorer" && <Explorer />}
      {activeView === "action" && <ActionCenter />}
      {activeView === "anomaly" && <AnomalyScore />}
      {activeView === "chargeback" && <Chargeback />}
      {activeView === "dataagent" && <DataAgentChat />}
    </AppShell>
  );
}

function App() {
  return (
    <PeriodProvider>
      <RoleProvider>
        <ChatProvider>
          <ActiveView />
        </ChatProvider>
      </RoleProvider>
    </PeriodProvider>
  );
}

export default App;
