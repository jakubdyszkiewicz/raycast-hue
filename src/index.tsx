import { ActionPanel, CopyToClipboardAction, List, OpenInBrowserAction, showToast, ToastStyle, getLocalStorageItem, setLocalStorageItem, Icon, Color } from "@raycast/api";
import { useState, useEffect } from "react";
import fetch from "node-fetch";
import { api, v3 } from "node-hue-api";
import { Api } from "node-hue-api/dist/esm/api/Api";

const hueDiscovery = v3.discovery
const hueApi = v3.api

const appName = 'raycast';
const deviceName = 'example-code';

async function discoverBridge() {
  const discoveryResults = await hueDiscovery.nupnpSearch();

  if (discoveryResults.length === 0) {
    throw new Error("Failed to resolve any Hue Bridges")
  }
  // Ignoring that you could have more than one Hue Bridge on a network as this is unlikely in 99.9% of users situations
  return discoveryResults[0].ipaddress;
}

const usernameStorageKey = "username"

async function loadUsername(): Promise<string | undefined> {
  return await getLocalStorageItem(usernameStorageKey)
}

async function saveUsername(username: string) {
  return await setLocalStorageItem(usernameStorageKey, username)
}

async function configuredHueApi(): Promise<Api> {
  let username: string | undefined = await loadUsername()
  if (username === undefined) {
    username = await createUser()
    saveUsername(username)
  }
  const ip: string = await discoverBridge()
  return hueApi.createLocal(ip).connect(username);
}

async function createUser(): Promise<string> {
  const ipAddress = await discoverBridge();

  // Create an unauthenticated instance of the Hue API so that we can create a new user
  const unauthenticatedApi = await hueApi.createLocal(ipAddress).connect();
  
  try {
    const createdUser = await unauthenticatedApi.users.createUser(appName, deviceName);
    const authenticatedApi = await hueApi.createLocal(ipAddress).connect(createdUser.username);

    // test the configuration
    await authenticatedApi.configuration.getConfiguration();
    return createdUser.username

  } catch(err: any) {
    if (err.getHueErrorType() === 101) {
      throw new Error('The Link button on the bridge was not pressed. Please press the Link button and try again.');
    } else {
      throw err
    }
  }
}

type Light = {
  id: string,
  name: string
  on: boolean
  reachable: boolean
}

export default function LightsList() {
  const [state, setState] = useState<{ lights: Light[] }>({ lights: [] });

  function updateState(lights: Light[]) {
    setState((oldState) => ({
      ...oldState,
      lights: lights,
    }));
  }

  useEffect(() => {
    async function fetch() {
      const api = await configuredHueApi()

      const lights: Light[] = (await api.lights.getAll())
        .map(lightType => {
          const state = lightType.state as any
          return {
            id: lightType.id.toString(),
            name: lightType.name,
            on: state.on,
            reachable: state.reachable
          } as Light
        })
        .sort((light1, light2) => light1.name.localeCompare(light2.name))

      console.log(lights)
      updateState(lights)
    }
    fetch();
  }, []);

  return (
    <List isLoading={state.lights.length == 0} searchBarPlaceholder="Filter lights by name...">
      {state.lights.map((light) => (
        <LightListItem key={light.id} light={light} />
      ))}
    </List>
  );
}


function LightListItem(props: { light: Light }) {
  const [state, setState] = useState<{ light: Light }>({ light: props.light });

  async function toggle() {
    const light = state.light
    const api = await configuredHueApi()
    // const currentState: any = await api.lights.getLightState(light.id)
    // currentState.on = !currentState.on
    await api.lights.setLightState(light.id, { on: !light.on })
    light.on = !light.on

    setState((oldState) => ({
      ...oldState,
      light: light
    }));
  }

  return (
    <List.Item
      id={state.light.id}
      key={state.light.id}
      title={state.light.name}
      // subtitle={light.on ? "on" : "off"}
      icon={{
        source: state.light.reachable ? Icon.Circle : Icon.XmarkCircle,
        tintColor: state.light.on && state.light.reachable ? Color.Yellow : Color.PrimaryText
      }}
      // accessoryTitle="what other title?"
      actions={
        <ActionPanel>
          <ActionPanel.Item title="Toggle" onAction={toggle} />
        </ActionPanel>
      }
    />
  );
}
