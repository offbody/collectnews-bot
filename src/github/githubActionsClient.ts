export type DispatchWorkflowOptions = {
  token: string
  repository: string
  workflowId: string
  ref: string
  inputs: Record<string, string>
}

export type UpsertRepositoryVariableOptions = {
  token: string
  repository: string
  name: string
  value: string
}

export async function dispatchWorkflow(options: DispatchWorkflowOptions) {
  const response = await fetch(
    `https://api.github.com/repos/${options.repository}/actions/workflows/${options.workflowId}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: options.ref,
        inputs: options.inputs,
      }),
    },
  )

  if (response.status !== 204) {
    const details = await response.text()
    throw new Error(
      `GitHub workflow dispatch failed: ${response.status} ${response.statusText}${details ? ` ${details}` : ""}`,
    )
  }
}

export async function upsertRepositoryVariable(
  options: UpsertRepositoryVariableOptions,
) {
  const existingVariableResponse = await callGitHubApi(
    options,
    `actions/variables/${options.name}`,
    {
      method: "GET",
    },
  )

  if (existingVariableResponse.status === 200) {
    const updateResponse = await callGitHubApi(
      options,
      `actions/variables/${options.name}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: options.name,
          value: options.value,
        }),
      },
    )

    if (updateResponse.status !== 204) {
      await throwGitHubError("GitHub variable update failed", updateResponse)
    }

    return
  }

  if (existingVariableResponse.status !== 404) {
    await throwGitHubError("GitHub variable lookup failed", existingVariableResponse)
  }

  const createResponse = await callGitHubApi(options, "actions/variables", {
    method: "POST",
    body: JSON.stringify({
      name: options.name,
      value: options.value,
    }),
  })

  if (createResponse.status !== 201) {
    await throwGitHubError("GitHub variable create failed", createResponse)
  }
}

async function callGitHubApi(
  options: Pick<UpsertRepositoryVariableOptions, "token" | "repository">,
  path: string,
  init: RequestInit,
) {
  return fetch(`https://api.github.com/repos/${options.repository}/${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  })
}

async function throwGitHubError(message: string, response: Response) {
  const details = await response.text()
  throw new Error(
    `${message}: ${response.status} ${response.statusText}${details ? ` ${details}` : ""}`,
  )
}
