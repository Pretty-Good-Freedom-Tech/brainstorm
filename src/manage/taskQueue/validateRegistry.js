#!/usr/bin/env node

/**
 * Task Registry Validator
 * Validates taskRegistry.json for consistency and broken references
 */

const fs = require('fs');
const path = require('path');

class RegistryValidator {
    constructor() {
        this.registryPath = path.join(__dirname, 'taskRegistry.json');
        this.errors = [];
        this.warnings = [];
    }

    validate() {
        console.log('🔍 Validating task registry...');
        
        try {
            const registry = JSON.parse(fs.readFileSync(this.registryPath, 'utf8'));
            
            this.validateTaskReferences(registry);
            this.validateScriptPaths(registry);
            this.validateHierarchy(registry);
            this.validateRequiredFields(registry);
            
            this.reportResults();
            
            return this.errors.length === 0;
        } catch (error) {
            this.errors.push(`Failed to parse registry: ${error.message}`);
            this.reportResults();
            return false;
        }
    }

    validateTaskReferences(registry) {
        const taskIds = Object.keys(registry.tasks || {});
        
        for (const [taskId, task] of Object.entries(registry.tasks || {})) {
            // Check parent references
            if (task.parent && !taskIds.includes(task.parent)) {
                this.errors.push(`Task '${taskId}' references non-existent parent '${task.parent}'`);
            }
            
            // Check children references
            if (task.children) {
                for (const childId of task.children) {
                    if (!taskIds.includes(childId)) {
                        this.errors.push(`Task '${taskId}' references non-existent child '${childId}'`);
                    }
                }
            }
        }
    }

    validateScriptPaths(registry) {
        const projectRoot = path.resolve(__dirname, '../../..');
        
        for (const [taskId, task] of Object.entries(registry.tasks || {})) {
            if (task.scripts) {
                for (const scriptPath of task.scripts) {
                    const fullPath = path.join(projectRoot, scriptPath);
                    if (!fs.existsSync(fullPath)) {
                        this.errors.push(`Task '${taskId}' references non-existent script '${scriptPath}'`);
                    }
                }
            }
        }
    }

    validateHierarchy(registry) {
        const taskIds = Object.keys(registry.tasks || {});
        const visited = new Set();
        
        // Check for circular dependencies
        for (const taskId of taskIds) {
            if (!visited.has(taskId)) {
                this.checkCircularDependency(registry.tasks, taskId, new Set(), visited);
            }
        }
    }

    checkCircularDependency(tasks, taskId, path, visited) {
        if (path.has(taskId)) {
            this.errors.push(`Circular dependency detected: ${Array.from(path).join(' -> ')} -> ${taskId}`);
            return;
        }
        
        if (visited.has(taskId)) {
            return;
        }
        
        visited.add(taskId);
        path.add(taskId);
        
        const task = tasks[taskId];
        if (task && task.children) {
            for (const childId of task.children) {
                this.checkCircularDependency(tasks, childId, path, visited);
            }
        }
        
        path.delete(taskId);
    }

    validateRequiredFields(registry) {
        const requiredFields = ['name', 'category', 'type', 'description', 'scripts'];
        
        for (const [taskId, task] of Object.entries(registry.tasks || {})) {
            for (const field of requiredFields) {
                if (!task[field]) {
                    this.warnings.push(`Task '${taskId}' missing recommended field '${field}'`);
                }
            }
        }
    }

    reportResults() {
        console.log('\n📊 Validation Results:');
        
        if (this.errors.length === 0) {
            console.log('✅ No errors found');
        } else {
            console.log(`❌ ${this.errors.length} error(s) found:`);
            this.errors.forEach(error => console.log(`   • ${error}`));
        }
        
        if (this.warnings.length > 0) {
            console.log(`⚠️  ${this.warnings.length} warning(s):`);
            this.warnings.forEach(warning => console.log(`   • ${warning}`));
        }
        
        console.log('');
    }
}

// Run if called directly
if (require.main === module) {
    const validator = new RegistryValidator();
    const isValid = validator.validate();
    process.exit(isValid ? 0 : 1);
}

module.exports = RegistryValidator;
