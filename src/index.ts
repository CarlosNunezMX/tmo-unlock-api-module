import { randomBytes } from "crypto"
/***
 * Main module, it's used by interact with t-mobile apis
 * @module
 ***/
export namespace TMO {
  /*** 
   * This namespace is used to define types for 
   * Inelegibility responses
  ***/
  export namespace Inelegibility {
    export class Reason {
      constructor(
        public code: string,
        public description: string,
        public alternateDescription: string
      ) { }
    }
    export interface Details {
      ineligiblityDetails: Reason[];
      statusItems: unknown
    }
  }
  /*** 
     * This namespace is used to define types for 
     * Elegibility responses
    ***/

  export namespace Elegibility {
    export enum Type {
      TEMPORAL = "1",
      PERMANENT = "2"
    };


    export class Response {
      constructor(
        public transactionId: number,
        public imei: string,
        public unlockType: Type,
        public currentUnlockStatus: boolean,
        public startDate: string,
        public endDate: string,
        public ineligiblityDetails: Inelegibility.Details,
        public uiCode: string,
        public uiMessage: string,
        public unlockEligible: boolean,
        public whitelisted: boolean
      ) { }
    };
  }
  /***
   * This namespace is for define Error classes,
   * and error responses
   ***/

  export namespace Errors {
    export class RequestError extends Error {
      constructor(public reasonCode: string) {
        super("RequestError - Couldn't send request.")
      }
    }
    export class NotAuthorizationRequested extends Error {
      constructor() {
        super("Use Client.login() before to use this method!");
      }
    }
    export interface RequestErrorResponse {
      errors: RequestErrorItem[];
    }
    export class RequestErrorItem {
      constructor(
        public reasonCode: string,
        public systemMessage: string,
        public userMessage: string
      ) { }
    }
  }

  function agregateHeaders(headers: Record<string, any>): Record<string, any> {
    return {
      Authorization: "Basic bzA0NlVBSUtVdlRJdmFudHlJR05sMDdZR3pyRlpxQnM6V1AwVTFkdkhQYVpoaUVKYg==",
      clientToken: "bWR1X2dfYXBwX2NsaWVudF9pZGVudGlmaWVyX3Rva2Vu",
      "Content-Type": "application/json",
      ...headers,
    }
  }


  /***
   * This namespace is used to define a session response, and
   * internal session class
   ***/
  export namespace Session {
    export class Session {
      constructor(
        public token_type: string,
        public access_token: string,
        public expires_in: Date
      ) { }

      public static fromResponse(response: Response): Session {
        return new Session(
          response.token_type,
          response.access_token,
          new Date(Date.now() + parseInt(response.expires_in) * 1000)
        )
      }

      public valid(): boolean {
        return Date.now() >= this.expires_in.getMilliseconds();
      }
    }
    export interface Response extends Omit<Session, "expires_in"> {
      expires_in: string
    }
  }

  /***
   * Unlock response
   ***/
  export namespace Unlock {
    export interface StatusItems {
      serviceStatusCode: string,
      serviceStatusItem: StatusItem[]
    }
    export class StatusItem {
      constructor(
        public statusCode: string | null,
        public statusDescription: string,
        public explanation: string,
        public referenceId: string | null
      ) { }

    }
    export class Response {
      constructor(
        public transactionId: number,
        public imei: string,
        public acknowledged: boolean,
        public statusItems: StatusItem
      ) { }
    }
  }



  function createTransactionID(): string {
    let id: bigint = -1n;

    while (id < 0n) {
      const buffer = randomBytes(8);
      id = buffer.readBigInt64BE();
    }
    return id.toString().padStart(19, '0');
  }
  /***
   * @description This is the client for TMO API
   * @example 
   * // create and login the client 
   * let client = new TMO.Client();
   * client = await client.login();
   *
   * // other way
   * const client = await new Client()
   *  .login();
   ***/
  export class Client {
    private apiEndpoint = "https://apis.t-mobile.com/mdu/v1";
    private session: Session.Session | undefined;

    /***
    * @description Authenticates the client with TMO Servers
    * @returns {Client}
    * @example
    * // Use and init
    * new TMO.Client().login();
    * // Use after initialization, for relogin
    * await client.login();
    ***/
    public async login(): Promise<Client> {
      const url = this.apiEndpoint + "/oauth2/token?grant_type=client_credentials"
      const request = await fetch(url, {
        method: "POST",
        headers: agregateHeaders({})
      })

      const response = await request.json() as Errors.RequestErrorResponse | Session.Response;
      if ((response as Errors.RequestErrorResponse).errors) throw new Errors.RequestError((response as Errors.RequestErrorResponse).errors[0]?.reasonCode || "-1");
      this.session = Session.Session.fromResponse(response as Session.Response);
      return this;
    }

    /***
    * @description Retrives device Elegibility Capability
    * @param {Elegibility.Type} type Type of unlock for check
    * @param {string} imei Imei to check
    * @returns {Promise<Elegibility.Response>} This is a promise of results
    * @example 
    * await client.getElegibility("1234", TMO.Elegibility.Type.PERMANENT);
    * // This will give an Elegibility.Response, save your transactionId
    ***/
    public async getElegibility(imei: string, type: Elegibility.Type): Promise<Elegibility.Response> {
      if (!this.session)
        throw new Errors.NotAuthorizationRequested();
      if (!this.session.valid())
        await this.login.bind(this)();

      const url = this.apiEndpoint + "/getEligibility";

      const body = JSON.stringify({
        targetImei: imei,
        transactionId: createTransactionID(),
        operationType: parseInt(type)
      });

      const request = await fetch(url, {
        method: "POST",
        headers: agregateHeaders({
          Authorization: `Bearer ${this.session?.access_token}`
        }),
        body
      });

      const response = await request.json() as Errors.RequestErrorResponse | Elegibility.Response;
      if ((response as Errors.RequestErrorResponse).errors) throw new Errors.RequestError((response as Errors.RequestErrorResponse).errors[0]?.reasonCode || "-1")
      return response as Elegibility.Response;
    }
    /***
    * @description If your device is clean an elegible, you can use this method to unlock the device 
    * @param {string} imei The imei to unlock
    * @param {Elegibility.Type} type The type of unlock, it requires to be **SAME** as used in previus method 
    * @param {string} transactionId Previus method transactionId used
    * @returns {Promise<Unlock.Response>}
    * @example 
    * await client.unlock("XAXAXA", Elegibility.Type.PERMANENT, elegible.transactionId);
    ***/
    public async unlock(imei: string, type: Elegibility.Type, transactionId: number): Promise<Unlock.Response> {
      if (!this.session)
        throw new Errors.NotAuthorizationRequested();
      if (!this.session.valid())
        await this.login.bind(this)();

      const url = this.apiEndpoint + "/unlock";
      const body = JSON.stringify({
        targetImei: imei,
        transactionId,
        operationType: parseInt(type)
      });
      const request = await fetch(url, {
        method: "POST",
        headers: agregateHeaders({
          Authorization: `Bearer ${this.session?.access_token}`
        }),
        body
      })

      const response = await request.json() as Errors.RequestErrorResponse | Unlock.Response;
      if ((response as Errors.RequestErrorResponse).errors) throw new Errors.RequestError((response as Errors.RequestErrorResponse).errors[0]?.reasonCode || "-1");

      return response as Unlock.Response;
    }
  }
};
