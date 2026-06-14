import { completionRegistry } from '../CompletionRegistry';
import { commandRegistry } from '../../services/commands';

completionRegistry.register(
    (ctx) => ctx.isCommand && !ctx.isTag && !ctx.isEventLine && !ctx.parentIsEvents,
    (ctx) => {
        const cmdWithArgsMatch = ctx.linePrefix.match(/^\s*-\s*~?([a-zA-Z0-9_]+)\s+(.*)$/);
        if (cmdWithArgsMatch) {
            const cmdName = cmdWithArgsMatch[1];
            return commandRegistry.getArgumentCompletions(cmdName);
        }

        const cmdMatch = ctx.linePrefix.match(/^\s*-\s*(~?[a-zA-Z0-9_]*)$/);
        if (cmdMatch) {
            return commandRegistry.getCommandCompletions();
        }
        
        return [];
    }
);