# Setting Up Branch Protection Rules

To prevent accidental force pushes and protect the main branch, follow these steps to set up branch protection rules:

1. Go to the repository settings: https://github.com/Pretty-Good-Freedom-Tech/hasenpfeffr/settings

2. In the left sidebar, click on "Branches"

3. Under "Branch protection rules", click "Add rule"

4. In the "Branch name pattern" field, enter `main`

5. Enable the following options:
   - ✅ Require a pull request before merging
   - ✅ Require approvals
   - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - ✅ Do not allow bypassing the above settings
   - ✅ Restrict who can push to matching branches
   - ✅ Allow force pushes (DISABLE THIS OPTION)
   - ✅ Allow deletions (DISABLE THIS OPTION)

6. Click "Create" or "Save changes"

These settings will ensure that:
- Direct pushes to the main branch are not allowed
- Pull requests require review and approval
- Force pushes are not allowed
- Branch deletion is not allowed

This helps prevent accidental data loss and ensures code quality through the review process.
